import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { createWinstonConfig } from './winston.config';

@Module({
    imports: [
        WinstonModule.forRoot(
            createWinstonConfig(
                process.env.LOG_LEVEL ?? 'debug',
                process.env.NODE_ENV === 'production',
            ),
        ),
    ],
    exports: [WinstonModule],
})
export class LoggerModule {}