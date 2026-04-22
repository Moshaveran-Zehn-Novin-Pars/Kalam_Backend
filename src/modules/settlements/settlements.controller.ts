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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SettlementsService } from './settlements.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '@prisma/client';
import { IsDateString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSettlementDto {
  @ApiProperty({ example: 'farmer-uuid' })
  @IsUUID()
  farmerId: string;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  periodEnd: string;
}

@ApiTags('Settlements')
@ApiBearerAuth('access-token')
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'لیست همه تسویه‌ها (ادمین)' })
  @ApiQuery({ name: 'status', required: false })
  findAll(@Query('status') status?: string) {
    return this.settlementsService.findAll(status);
  }

  @Get('my')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'تسویه‌های من (باغدار)' })
  getMySettlements(@CurrentUser() user: AuthUser) {
    return this.settlementsService.getFarmerSettlements(user.id);
  }

  @Get('calculate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'محاسبه تسویه برای باغدار (ادمین)' })
  @ApiQuery({ name: 'farmerId', required: true })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  calculate(
    @Query('farmerId') farmerId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.settlementsService.calculateForFarmer(
      farmerId,
      new Date(from),
      new Date(to),
    );
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'ایجاد تسویه (ادمین)' })
  createSettlement(@Body() dto: CreateSettlementDto) {
    return this.settlementsService.createSettlement(
      dto.farmerId,
      new Date(dto.periodStart),
      new Date(dto.periodEnd),
    );
  }

  @Post(':id/payout')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'پرداخت تسویه (ادمین)' })
  processPayout(@Param('id', ParseUUIDPipe) id: string) {
    return this.settlementsService.processPayout(id);
  }
}
