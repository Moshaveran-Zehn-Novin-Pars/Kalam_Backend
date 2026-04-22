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
import { DisputesService } from './disputes.service';
import { CreateDisputeDto, ResolveDisputeDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { DisputeStatus, UserRole } from '@prisma/client';

@ApiTags('Disputes')
@ApiBearerAuth('access-token')
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiOperation({ summary: 'لیست همه اعتراضات (ادمین)' })
  @ApiQuery({ name: 'status', required: false, enum: DisputeStatus })
  findAll(@Query('status') status?: DisputeStatus) {
    return this.disputesService.findAll(status);
  }

  @Get('my')
  @ApiOperation({ summary: 'اعتراضات من' })
  getMyDisputes(@CurrentUser() user: AuthUser) {
    return this.disputesService.getMyDisputes(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات اعتراض' })
  findById(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.disputesService.findById(id, user.id, user.role);
  }

  @Post()
  @ApiOperation({ summary: 'ثبت اعتراض' })
  createDispute(@CurrentUser() user: AuthUser, @Body() dto: CreateDisputeDto) {
    return this.disputesService.createDispute(user.id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تغییر وضعیت اعتراض (ادمین)' })
  @ApiQuery({ name: 'status', required: true, enum: DisputeStatus })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status: DisputeStatus,
  ) {
    return this.disputesService.updateStatus(id, status);
  }

  @Post(':id/resolve')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'حل اعتراض (ادمین)' })
  resolveDispute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.disputesService.resolveDispute(id, user.id, dto);
  }
}
