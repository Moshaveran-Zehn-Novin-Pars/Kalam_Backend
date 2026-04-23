import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class QualityDetectionDto {
  @ApiProperty({ example: 'https://storage.example.com/product.jpg' })
  @IsString()
  imageUrl: string;

  @ApiPropertyOptional({ example: 'apple' })
  @IsOptional()
  @IsString()
  productType?: string;
}
