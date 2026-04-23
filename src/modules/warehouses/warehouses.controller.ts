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
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto, ReserveWarehouseDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Warehouses')
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'لیست سردخانه‌ها' })
  @ApiQuery({ name: 'hasRefrigeration', required: false, type: Boolean })
  findAll(@Query('hasRefrigeration') hasRefrigeration?: string) {
    const filter =
      hasRefrigeration !== undefined ? hasRefrigeration === 'true' : undefined;
    return this.warehousesService.findAll(filter);
  }

  @Get('my-reservations')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'رزروهای من' })
  getMyReservations(@CurrentUser() user: AuthUser) {
    return this.warehousesService.getMyReservations(user.id);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'جزئیات سردخانه' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehousesService.findById(id);
  }

  @Post()
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'ایجاد سردخانه (ادمین)' })
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.warehousesService.createWarehouse(dto);
  }

  @Post(':id/reserve')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'رزرو فضای سردخانه' })
  reserveSpace(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReserveWarehouseDto,
  ) {
    return this.warehousesService.reserveSpace(user.id, id, dto);
  }

  @Post('reservations/:id/cancel')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'لغو رزرو' })
  cancelReservation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.warehousesService.cancelReservation(user.id, id);
  }
}
