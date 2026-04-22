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
import { PaymentsService } from './payments.service';
import {
  InitiatePaymentDto,
  WalletDepositDto,
  QueryTransactionsDto,
} from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Payments')
@ApiBearerAuth('access-token')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('wallet')
  @ApiOperation({ summary: 'مشاهده کیف پول' })
  getWallet(@CurrentUser() user: AuthUser) {
    return this.paymentsService.getWallet(user.id);
  }

  @Get('wallet/transactions')
  @ApiOperation({ summary: 'تاریخچه تراکنش‌های کیف پول' })
  getTransactions(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryTransactionsDto,
  ) {
    return this.paymentsService.getTransactions(user.id, query);
  }

  @Post('wallet/deposit')
  @ApiOperation({ summary: 'شارژ کیف پول' })
  depositToWallet(
    @CurrentUser() user: AuthUser,
    @Body() dto: WalletDepositDto,
  ) {
    return this.paymentsService.depositToWallet(user.id, dto);
  }

  @Post('initiate')
  @ApiOperation({ summary: 'شروع فرآیند پرداخت' })
  initiatePayment(
    @CurrentUser() user: AuthUser,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiatePayment(user.id, dto);
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'اطلاعات پرداخت سفارش' })
  getPaymentByOrder(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.paymentsService.getPaymentByOrder(user.id, orderId);
  }

  @Post('order/:orderId/release-escrow')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'آزادسازی escrow (ادمین)' })
  releaseEscrow(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.paymentsService.releaseEscrow(orderId, user.id);
  }

  @Post('order/:orderId/refund')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'استرداد وجه (ادمین)' })
  refundPayment(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.paymentsService.refundPayment(orderId, user.id);
  }
}
