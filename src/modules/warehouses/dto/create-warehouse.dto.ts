import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'سردخانه مرکزی تهران' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'تهران، جاده مخصوص' })
  @IsString()
  @MaxLength(500)
  address: string;

  @ApiProperty({ example: 35.6892 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 51.389 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiProperty({ example: 10000 })
  @IsNumber()
  @Min(1)
  totalCapacityKg: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hasRefrigeration?: boolean;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  tempMin?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsNumber()
  tempMax?: number;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0)
  pricePerKgPerDay: number;
}
