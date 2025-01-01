import type { Logger } from 'pino';
import pino from 'pino';

export const logger: Logger
  = process.env.NODE_ENV === 'production'
    ? pino({ level: 'warn' })
    : pino({
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        },
        level: 'debug',
      });
