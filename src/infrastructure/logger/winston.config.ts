import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';

export function createWinstonConfig(
  logLevel: string,
  isProduction: boolean,
): winston.LoggerOptions {
  const transports: winston.transport[] = [];

  if (isProduction) {
    // Production: JSON format for log aggregation (ELK, Loki, etc.)
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.ms(),
          winston.format.json(),
        ),
      }),
      // Production: also write errors to file
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    );
  } else {
    // Development: pretty colored format
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.ms(),
          nestWinstonModuleUtilities.format.nestLike('Kalam', {
            colors: true,
            prettyPrint: true,
          }),
        ),
      }),
    );
  }

  return {
    level: logLevel,
    transports,
    // Don't exit on uncaught exceptions
    exitOnError: false,
  };
}
