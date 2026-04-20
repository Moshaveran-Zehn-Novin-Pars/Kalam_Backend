import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateBuyerDto {
  @ApiPropertyOptional({ example: 'سوپرمارکت ستاره' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @ApiPropertyOptional({ example: 'SUPERMARKET' })
  @IsOptional()
  @IsString()
  businessType?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  economicCode?: string;
}
