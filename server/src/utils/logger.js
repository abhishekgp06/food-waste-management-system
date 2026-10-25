import winston from 'winston';

const { combine, timestamp, errors, json, printf, colorize } = winston.format;

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Human-readable dev format
const devFormat = printf(({ level, message, timestamp: time, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${time}] [${level}] ${stack || message}${metaStr}`;
});

// Structured JSON format for CloudWatch / production
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isTest ? 'error' : isProduction ? 'info' : 'debug'),
  defaultMeta: {
    service: 'food-waste-management-api'
  },
  format: isProduction ? prodFormat : combine(
    colorize(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    devFormat
  ),
  transports: [
    new winston.transports.Console()
  ]
});

export default logger;
