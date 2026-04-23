import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AiBridgeService } from './ai-bridge.service';
import {
  PricePredictionDto,
  QualityDetectionDto,
  RecommendationDto,
  ChatDto,
} from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('AI')
@ApiBearerAuth('access-token')
@Controller('ai')
export class AiBridgeController {
  constructor(private readonly aiBridgeService: AiBridgeService) {}

  @Post('price-prediction')
  @Public()
  @ApiOperation({ summary: 'پیش‌بینی قیمت محصول' })
  predictPrice(@Body() dto: PricePredictionDto) {
    return this.aiBridgeService.predictPrice(dto);
  }

  @Post('quality-detection')
  @ApiOperation({ summary: 'تشخیص کیفیت محصول از تصویر' })
  detectQuality(@Body() dto: QualityDetectionDto) {
    return this.aiBridgeService.detectQuality(dto);
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'پیشنهاد محصول برای کاربر' })
  getRecommendations(
    @CurrentUser() user: AuthUser,
    @Query() dto: RecommendationDto,
  ) {
    return this.aiBridgeService.getRecommendations(user.id, dto);
  }

  @Post('chat')
  @ApiOperation({ summary: 'چت هوشمند - Prompt to Cart' })
  chat(@CurrentUser() user: AuthUser, @Body() dto: ChatDto) {
    return this.aiBridgeService.chat(user.id, dto);
  }

  @Get('demand-forecast')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'پیش‌بینی تقاضا برای باغدار' })
  forecastDemand(@CurrentUser() user: AuthUser) {
    return this.aiBridgeService.forecastDemand(user.id);
  }
}
