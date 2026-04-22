import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { DeliveriesService } from './deliveries.service';
import { AssignDriverDto, UpdateLocationDto, ConfirmDeliveryDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { DeliveryStatus, UserRole } from '@prisma/client';

@ApiTags('Deliveries')
@ApiBearerAuth('access-token')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'لیست همه حمل‌ونقل‌ها (ادمین)' })
  @ApiQuery({ name: 'status', required: false, enum: DeliveryStatus })
  findAll(@Query('status') status?: DeliveryStatus) {
    return this.deliveriesService.findAll(status);
  }

  @Get('my')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: 'حمل‌ونقل‌های من (راننده)' })
  getMyDeliveries(@CurrentUser() user: AuthUser) {
    return this.deliveriesService.getMyDeliveries(user.id);
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'اطلاعات حمل‌ونقل سفارش' })
  getDeliveryByOrder(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.deliveriesService.getDeliveryByOrder(orderId, user.id);
  }

  @Post('order/:orderId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'ایجاد حمل‌ونقل برای سفارش (ادمین)' })
  createDelivery(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.deliveriesService.createDelivery(orderId, user.id);
  }

  @Patch(':id/assign-driver')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تخصیص راننده (ادمین)' })
  assignDriver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDriverDto,
  ) {
    return this.deliveriesService.assignDriver(id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.DRIVER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تغییر وضعیت حمل‌ونقل (راننده)' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status: DeliveryStatus,
  ) {
    return this.deliveriesService.updateStatus(id, user.id, status);
  }

  @Post(':id/location')
  @Roles(UserRole.DRIVER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'بروزرسانی موقعیت راننده' })
  updateLocation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.deliveriesService.updateLocation(id, user.id, dto);
  }

  @Post(':id/confirm')
  @Roles(UserRole.DRIVER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تأیید تحویل (راننده)' })
  confirmDelivery(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDeliveryDto,
  ) {
    return this.deliveriesService.confirmDelivery(id, user.id, dto);
  }
}
