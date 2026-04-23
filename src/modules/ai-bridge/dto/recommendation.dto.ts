import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class RecommendationDto {
  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  count?: number = 10;

  @ApiPropertyOptional({
    example: 'homepage',
    enum: ['homepage', 'pdp', 'cart'],
  })
  @IsOptional()
  @IsString()
  context?: string = 'homepage';
}
