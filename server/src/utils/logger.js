import winston from 'winston';
import { env } from '../config/env.js';

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

const devFormat = printf(({ level, message, timestamp, stack, requestId, ...meta }) => {
  const reqPart = requestId ? `[${requestId.slice(0, 8)}] ` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level}: ${reqPart}${message}${stack ? `\n${stack}` : ''}${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (env.isProd ? 'info' : 'debug'),
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    errors({ stack: true })
  ),
  transports: [
    new winston.transports.Console({
      silent: process.env.NODE_ENV === 'test' && !process.env.DEBUG_TESTS,
      format: env.isProd ? json() : combine(colorize(), devFormat),
    }),
  ],
});
