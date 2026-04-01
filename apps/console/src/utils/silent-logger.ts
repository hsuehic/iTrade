import type { ILogger } from '@itrade/core';

export const silentLogger: ILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  logOrder: () => {},
  logTrade: () => {},
  logStrategy: () => {},
  logRisk: () => {},
};
