import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service';
import { AppConfigService } from '../../config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisService, AppConfigService],
  exports: [RedisService],
})
export class RedisModule {}
