import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FarmersService } from './farmers.service';
import { UpdateFarmerDto, QueryFarmersDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Farmers')
@Controller('farmers')
export class FarmersController {
  constructor(private readonly farmersService: FarmersService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'لیست باغداران (عمومی)' })
  findAll(@Query() query: QueryFarmersDto) {
    return this.farmersService.findAll(query);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'پروفایل باغدار جاری' })
  getMyProfile(@CurrentUser() user: AuthUser) {
    return this.farmersService.getMyProfile(user.id);
  }

  @Patch('me')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'آپدیت پروفایل باغدار' })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateFarmerDto) {
    return this.farmersService.updateProfile(user.id, dto);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'پروفایل باغدار با ID (عمومی)' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmersService.findById(id);
  }

  @Patch(':id/verify')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تأیید باغدار (ادمین)' })
  verifyFarmer(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmersService.verifyFarmer(id);
  }
}
