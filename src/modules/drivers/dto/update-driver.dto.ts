import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';

export class UpdateDriverDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ example: 35.6892 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  currentLat?: number;

  @ApiPropertyOptional({ example: 51.389 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  currentLng?: number;
}
