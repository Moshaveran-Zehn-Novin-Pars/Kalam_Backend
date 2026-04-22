import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Invoices')
@ApiBearerAuth('access-token')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'لیست همه فاکتورها (ادمین)' })
  findAll() {
    return this.invoicesService.findAll();
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'فاکتور سفارش' })
  getInvoiceByOrder(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.invoicesService.getInvoiceByOrder(orderId, user.id);
  }

  @Get(':id/data')
  @ApiOperation({ summary: 'داده‌های فاکتور برای PDF' })
  getInvoiceData(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.getInvoiceData(id);
  }

  @Post('order/:orderId/generate')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'صدور فاکتور برای سفارش (ادمین)' })
  generateInvoice(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.invoicesService.generateInvoice(orderId);
  }
}
