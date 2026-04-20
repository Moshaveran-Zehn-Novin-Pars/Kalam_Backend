import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  MaxLength,
  Matches,
  Min,
  Max,
} from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ example: 'انبار اصلی' })
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiProperty({ example: 'تهران، خیابان ولیعصر، پلاک ۱۲۳' })
  @IsString()
  @MaxLength(500)
  fullAddress: string;

  @ApiProperty({ example: 'تهران' })
  @IsString()
  @MaxLength(50)
  province: string;

  @ApiProperty({ example: 'تهران' })
  @IsString()
  @MaxLength(50)
  city: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'کد پستی باید ۱۰ رقم باشد' })
  postalCode?: string;

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

  @ApiProperty({ example: 'علی محمدی' })
  @IsString()
  @MaxLength(100)
  receiverName: string;

  @ApiProperty({ example: '09123456789' })
  @IsString()
  @Matches(/^09[0-9]{9}$/, { message: 'شماره موبایل نامعتبر است' })
  receiverPhone: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
