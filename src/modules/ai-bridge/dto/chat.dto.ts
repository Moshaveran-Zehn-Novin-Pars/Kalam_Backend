import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class ChatDto {
  @ApiProperty({ example: 'سیب قرمز با کیفیت می‌خوام ۲۰۰ کیلو' })
  @IsString()
  @MaxLength(1000)
  message: string;

  @ApiPropertyOptional({ example: 'session-uuid' })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
