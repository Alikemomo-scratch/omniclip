import { AsyncLocalStorage } from 'async_hooks';

export interface LoggerContextData {
  requestId: string;
}

export const loggerContext = new AsyncLocalStorage<LoggerContextData>();
