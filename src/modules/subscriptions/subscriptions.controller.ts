import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Subscriptions')
@ApiBearerAuth('access-token')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'اشتراک‌های من' })
  getMySubscriptions(@CurrentUser() user: AuthUser) {
    return this.subscriptionsService.getMySubscriptions(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'ایجاد اشتراک دوره‌ای' })
  createSubscription(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.subscriptionsService.createSubscription(user.id, dto);
  }

  @Patch(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'توقف اشتراک' })
  pauseSubscription(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.subscriptionsService.pauseSubscription(user.id, id);
  }

  @Patch(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'از سرگیری اشتراک' })
  resumeSubscription(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.subscriptionsService.resumeSubscription(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'لغو اشتراک' })
  cancelSubscription(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.subscriptionsService.cancelSubscription(user.id, id);
  }
}
