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
import { CommissionsService } from './commissions.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import {
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommissionRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  farmerId?: string;

  @ApiProperty({ example: 0.06 })
  @IsNumber()
  @Min(0)
  @Max(1)
  rate: number;

  @ApiProperty()
  @IsDateString()
  validFrom: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validTo?: string;
}

export class UpdateCommissionRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  rate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;
}

@ApiTags('Commissions')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@Controller('commissions')
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get()
  @ApiOperation({ summary: 'لیست قوانین کمیسیون (ادمین)' })
  findAll() {
    return this.commissionsService.findAll();
  }

  @Get('stats')
  @ApiOperation({ summary: 'آمار کمیسیون‌ها (ادمین)' })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  getStats(@Query('from') from: string, @Query('to') to: string) {
    return this.commissionsService.getStats(new Date(from), new Date(to));
  }

  @Post()
  @ApiOperation({ summary: 'ایجاد قانون کمیسیون (ادمین)' })
  createRule(@Body() dto: CreateCommissionRuleDto) {
    return this.commissionsService.createRule({
      categoryId: dto.categoryId,
      farmerId: dto.farmerId,
      rate: dto.rate,
      validFrom: new Date(dto.validFrom),
      validTo: dto.validTo ? new Date(dto.validTo) : undefined,
    });
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'آپدیت قانون کمیسیون (ادمین)' })
  updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommissionRuleDto,
  ) {
    return this.commissionsService.updateRule(id, dto);
  }
}
