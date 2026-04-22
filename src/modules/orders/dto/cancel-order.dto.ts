import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @ApiPropertyOptional({ example: 'تغییر برنامه' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
