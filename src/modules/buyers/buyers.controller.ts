import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BuyersService } from './buyers.service';
import { UpdateBuyerDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Buyers')
@ApiBearerAuth('access-token')
@Controller('buyers')
export class BuyersController {
  constructor(private readonly buyersService: BuyersService) {}

  @Get('me')
  @Roles(UserRole.BUYER)
  @ApiOperation({ summary: 'پروفایل خریدار جاری' })
  getMyProfile(@CurrentUser() user: AuthUser) {
    return this.buyersService.getMyProfile(user.id);
  }

  @Patch('me')
  @Roles(UserRole.BUYER)
  @ApiOperation({ summary: 'آپدیت پروفایل خریدار' })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateBuyerDto) {
    return this.buyersService.updateProfile(user.id, dto);
  }
}
