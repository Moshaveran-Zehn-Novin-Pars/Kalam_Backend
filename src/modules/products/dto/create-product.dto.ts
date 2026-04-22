import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsUUID,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';
import { QualityGrade } from '@prisma/client';

export class CreateProductDto {
  @ApiProperty({ example: 'category-uuid' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 'سیب قرمز درجه یک' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'red-apple-grade-a' })
  @IsString()
  @MaxLength(200)
  slug: string;

  @ApiPropertyOptional({ example: 'توضیحات محصول' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'اصفهان، شهرضا' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  origin?: string;

  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsDateString()
  harvestDate?: string;

  @ApiProperty({ enum: QualityGrade, example: QualityGrade.A })
  @IsEnum(QualityGrade)
  qualityGrade: QualityGrade;

  @ApiProperty({ example: 'KG' })
  @IsString()
  @MaxLength(20)
  unit: string;

  @ApiProperty({ example: 45000 })
  @IsNumber()
  @Min(0)
  pricePerUnit: number;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(1)
  minOrderQty: number;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxOrderQty?: number;

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(0)
  stockQty: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  requiresColdChain?: boolean;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  storageTempMin?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsNumber()
  storageTempMax?: number;

  @ApiPropertyOptional({ example: 14 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  shelfLifeDays?: number;
}
