import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: { field: string; message: string }[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const errorResponse = this.buildErrorResponse(exception);

    if (errorResponse.statusCode >= 500) {
      this.logger.error(
        `${errorResponse.statusCode} ${errorResponse.error}: ${errorResponse.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(exception: unknown): ErrorResponse {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Handle class-validator validation errors
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;

        // class-validator returns { message: string[] | string, error: string, statusCode: number }
        const rawMessage = resp['message'];
        const details = Array.isArray(rawMessage)
          ? rawMessage.map((msg: string) => this.parseValidationMessage(msg))
          : undefined;

        return {
          statusCode: status,
          error: (resp['error'] as string) || exception.message,
          message: details
            ? 'Validation failed'
            : typeof rawMessage === 'string'
              ? rawMessage
              : exception.message,
          ...(details && { details }),
        };
      }

      return {
        statusCode: status,
        error: HttpStatus[status] || 'Error',
        message: typeof exceptionResponse === 'string' ? exceptionResponse : exception.message,
      };
    }

    // Unknown errors
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    };
  }

  private parseValidationMessage(msg: string): {
    field: string;
    message: string;
  } {
    // class-validator messages typically start with the property name
    // e.g., "email must be an email", "password must be longer than or equal to 8 characters"
    const parts = msg.split(' ');
    const field = parts[0] || 'unknown';
    return { field, message: msg };
  }
}
