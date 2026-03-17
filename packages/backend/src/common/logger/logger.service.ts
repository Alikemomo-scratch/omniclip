import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { loggerContext } from './logger.context';

@Injectable()
export class LoggerService implements NestLoggerService {
  log(message: any, context?: string) {
    this.printLog('info', message, context);
  }

  error(message: any, trace?: string, context?: string) {
    this.printLog('error', message, context, trace);
  }

  warn(message: any, context?: string) {
    this.printLog('warn', message, context);
  }

  debug(message: any, context?: string) {
    this.printLog('debug', message, context);
  }

  verbose(message: any, context?: string) {
    this.printLog('verbose', message, context);
  }

  private printLog(level: string, message: any, context?: string, trace?: string) {
    const store = loggerContext.getStore();
    const requestId = store?.requestId;

    let msg = message;
    let redactedData = undefined;

    if (typeof message === 'object') {
      redactedData = this.redact(message);
      msg = 'Object payload';
    }

    const output = {
      timestamp: new Date().toISOString(),
      level,
      context,
      requestId,
      message: msg,
      data: redactedData,
      trace,
    };

    console.log(JSON.stringify(output));
  }

  private redact(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.redact(item));

    const copy = { ...obj };
    const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'cookie', 'session'];

    for (const key of Object.keys(copy)) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        copy[key] = '[REDACTED]';
      } else if (typeof copy[key] === 'object') {
        copy[key] = this.redact(copy[key]);
      }
    }
    return copy;
  }
}
