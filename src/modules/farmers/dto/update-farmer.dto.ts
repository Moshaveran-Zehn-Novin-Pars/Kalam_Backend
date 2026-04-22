import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  MaxLength,
  Matches,
  Min,
  Max,
} from 'class-validator';

export class UpdateFarmerDto {
  @ApiPropertyOptional({ example: 'باغ سیب طلایی' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @ApiPropertyOptional({ example: 'توضیحات باغ' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'اصفهان، شهرضا' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  farmLocation?: string;

  @ApiPropertyOptional({ example: 31.9244 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  farmLat?: number;

  @ApiPropertyOptional({ example: 51.8678 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  farmLng?: number;

  @ApiPropertyOptional({ example: 'IR062960000000100324200001' })
  @IsOptional()
  @IsString()
  @Matches(/^IR[0-9]{24}$/, { message: 'شماره شبا نامعتبر است' })
  iban?: string;
}
