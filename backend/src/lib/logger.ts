import { Application } from "express";
import path from "node:path";
import winston from 'winston';

const JSON_LINES_FORMAT = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
)

const CONSOLE_FORMAT = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message, location, ...meta }) => {
    // Create a string representation of the meta information if it exists
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
    
    let localStr = `api`;

    if (location) {
      localStr += `.${location}`;
    }

    // Format the log message with timestamp, level, location, message, and meta information
    return `${timestamp} [${level.toUpperCase()}] [${localStr}] ${message} ${metaString}`;
  })
);

export default function initializeLogger(app: Application) {
  const logLevel = app.config.get('logging.level', 'info');

  const transports: winston.LoggerOptions['transports'] = [];

  if (app.config.getBoolean('log.toConsole', true)) {
    transports.push(new winston.transports.Console({
      format: CONSOLE_FORMAT,
      level: logLevel
    }));
  }

  if (app.config.getBoolean('log.toFile', true)) {
    transports.push(new winston.transports.File({
      filename: path.join(app.config.getConfigDir('logs'), 'app.log'),
      format: JSON_LINES_FORMAT,
      level: logLevel,
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
      tailable: true
    }));
  }

  const logger = winston.createLogger({
    level: logLevel,
    transports
  });

  app.logger = logger;
}