import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './modules/health/health.module';
import {
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  validateEnv,
  AppConfigService
} from './config';
import { PrismaModule } from './infrastructure/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      load: [
          appConfig,
          databaseConfig,
          redisConfig,
          jwtConfig
      ],
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppConfigService],
  exports: [AppConfigService],
})
export class AppModule {}