import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';

export enum SubscriptionFrequency {
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
}

export class CreateSubscriptionDto {
  @ApiProperty({ example: 'product-uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 'address-uuid' })
  @IsUUID()
  addressId: string;

  @ApiProperty({ example: 200 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ enum: SubscriptionFrequency })
  @IsEnum(SubscriptionFrequency)
  frequency: SubscriptionFrequency;

  @ApiProperty({ example: '2026-05-01' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 'لطفاً تازه باشد' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
