import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

export class DashboardQueryDto {
  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number = 6;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

@ApiTags('Admin Dashboard')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN, UserRole.SUPPORT)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'آمار کلی داشبورد' })
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('revenue-chart')
  @ApiOperation({ summary: 'نمودار درآمد ماهانه' })
  @ApiQuery({ name: 'months', required: false, type: Number })
  getRevenueChart(@Query('months') months?: number) {
    return this.adminService.getRevenueChart(months ? Number(months) : 6);
  }

  @Get('orders-by-status')
  @ApiOperation({ summary: 'تعداد سفارشات بر اساس وضعیت' })
  getOrdersByStatus() {
    return this.adminService.getOrdersByStatus();
  }

  @Get('top-products')
  @ApiOperation({ summary: 'پرفروش‌ترین محصولات' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getTopProducts(@Query('limit') limit?: number) {
    return this.adminService.getTopProducts(limit ? Number(limit) : 10);
  }

  @Get('top-farmers')
  @ApiOperation({ summary: 'برترین باغداران' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getTopFarmers(@Query('limit') limit?: number) {
    return this.adminService.getTopFarmers(limit ? Number(limit) : 10);
  }

  @Get('recent-orders')
  @ApiOperation({ summary: 'سفارشات اخیر' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getRecentOrders(@Query('limit') limit?: number) {
    return this.adminService.getRecentOrders(limit ? Number(limit) : 10);
  }

  @Get('user-growth')
  @ApiOperation({ summary: 'نمودار رشد کاربران' })
  @ApiQuery({ name: 'months', required: false, type: Number })
  getUserGrowthChart(@Query('months') months?: number) {
    return this.adminService.getUserGrowthChart(months ? Number(months) : 6);
  }

  @Get('category-sales')
  @ApiOperation({ summary: 'فروش بر اساس دسته‌بندی' })
  getCategorySales() {
    return this.adminService.getCategorySales();
  }

  @Get('system-stats')
  @ApiOperation({ summary: 'آمار سیستم' })
  getSystemStats() {
    return this.adminService.getSystemStats();
  }
}
