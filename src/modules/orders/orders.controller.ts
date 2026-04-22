import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto, QueryOrdersDto, CancelOrderDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Orders')
@ApiBearerAuth('access-token')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'لیست سفارشات من' })
  findMyOrders(@CurrentUser() user: AuthUser, @Query() query: QueryOrdersDto) {
    return this.ordersService.findMyOrders(user.id, query);
  }

  @Get('admin')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'همه سفارشات (ادمین)' })
  findAllOrders(@Query() query: QueryOrdersDto) {
    return this.ordersService.findAllOrders(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات سفارش' })
  findById(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.findById(user.id, id, user.role);
  }

  @Post()
  @ApiOperation({ summary: 'ثبت سفارش از سبد خرید' })
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(user.id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'لغو سفارش' })
  cancelOrder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(user.id, id, dto, user.role);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'تأیید سفارش توسط باغدار' })
  confirmOrder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.confirmOrder(user.id, id);
  }
}
