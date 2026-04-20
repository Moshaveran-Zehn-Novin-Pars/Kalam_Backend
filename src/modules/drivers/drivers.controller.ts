import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DriversService } from './drivers.service';
import { UpdateDriverDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Drivers')
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get('available')
  @Public()
  @ApiOperation({ summary: 'لیست رانندگان در دسترس' })
  findAvailable() {
    return this.driversService.findAvailable();
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: 'پروفایل راننده جاری' })
  getMyProfile(@CurrentUser() user: AuthUser) {
    return this.driversService.getMyProfile(user.id);
  }

  @Patch('me/status')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: 'آپدیت وضعیت راننده (موقعیت + در دسترس بودن)' })
  updateStatus(@CurrentUser() user: AuthUser, @Body() dto: UpdateDriverDto) {
    return this.driversService.updateStatus(user.id, dto);
  }
}
