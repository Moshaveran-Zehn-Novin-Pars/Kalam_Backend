import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiBridgeController } from './ai-bridge.controller';
import { AiBridgeService } from './ai-bridge.service';
import { AppConfigService } from '../../config';

@Module({
  imports: [ConfigModule],
  controllers: [AiBridgeController],
  providers: [AiBridgeService, AppConfigService],
  exports: [AiBridgeService],
})
export class AiBridgeModule {}
