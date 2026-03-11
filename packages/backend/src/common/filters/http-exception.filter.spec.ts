import { describe, it, expect, vi } from 'vitest';
import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function createMockHost(statusCode?: number) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status, json };
  const request = { url: '/test', method: 'GET' };

  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({ getData: () => undefined, getContext: () => undefined }),
    switchToWs: () => ({
      getData: () => undefined,
      getClient: () => undefined,
      getPattern: () => undefined,
    }),
    getType: () => 'http' as const,
    _response: response,
    _json: json,
    _status: status,
  };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('should format HttpException with standard error response', () => {
    const host = createMockHost();
    const exception = new NotFoundException('User not found');

    filter.catch(exception, host as any);

    expect(host._status).toHaveBeenCalledWith(404);
    expect(host._json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
    });
  });

  it('should format validation errors with details array', () => {
    const host = createMockHost();
    const exception = new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: ['email must be an email', 'password must be longer than or equal to 8 characters'],
    });

    filter.catch(exception, host as any);

    expect(host._status).toHaveBeenCalledWith(400);
    const body = host._json.mock.calls[0][0];
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Validation failed');
    expect(body.details).toHaveLength(2);
    expect(body.details[0].field).toBe('email');
    expect(body.details[1].field).toBe('password');
  });

  it('should format unknown errors as 500', () => {
    const host = createMockHost();
    const exception = new Error('Something broke');

    filter.catch(exception, host as any);

    expect(host._status).toHaveBeenCalledWith(500);
    expect(host._json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  it('should handle UnauthorizedException', () => {
    const host = createMockHost();
    const exception = new UnauthorizedException('Invalid credentials');

    filter.catch(exception, host as any);

    expect(host._status).toHaveBeenCalledWith(401);
    const body = host._json.mock.calls[0][0];
    expect(body.statusCode).toBe(401);
    expect(body.message).toBe('Invalid credentials');
  });

  it('should handle non-Error thrown values', () => {
    const host = createMockHost();

    filter.catch('string error', host as any);

    expect(host._status).toHaveBeenCalledWith(500);
    expect(host._json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });
});
