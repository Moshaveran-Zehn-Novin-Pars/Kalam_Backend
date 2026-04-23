import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuctionsService } from './auctions.service';
import { CreateAuctionDto, PlaceBidDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '@prisma/client';

@ApiTags('Auctions')
@Controller('auctions')
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'لیست مزایده‌ها' })
  @ApiQuery({ name: 'status', required: false })
  findAll(@Query('status') status?: string) {
    return this.auctionsService.findAll(status);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'جزئیات مزایده' })
  findById(@Param('id') id: string) {
    return this.auctionsService.findById(id);
  }

  @Post()
  @ApiBearerAuth('access-token')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'ایجاد مزایده (باغدار)' })
  createAuction(@CurrentUser() user: AuthUser, @Body() dto: CreateAuctionDto) {
    return this.auctionsService.createAuction(user.id, dto);
  }

  @Post(':id/bid')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ثبت پیشنهاد قیمت' })
  placeBid(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PlaceBidDto,
  ) {
    return this.auctionsService.placeBid(user.id, id, dto);
  }

  @Post(':id/end')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'پایان مزایده (ادمین)' })
  endAuction(@Param('id') id: string) {
    return this.auctionsService.endAuction(id);
  }
}
