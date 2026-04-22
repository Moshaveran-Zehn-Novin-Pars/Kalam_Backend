import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsObject,
  MaxLength,
} from 'class-validator';

export class CreateNotificationDto {
  @ApiProperty({ example: 'user-uuid' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'ORDER_CONFIRMED' })
  @IsString()
  type: string;

  @ApiProperty({ example: 'سفارش تأیید شد' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'سفارش شما توسط باغدار تأیید شد' })
  @IsString()
  @MaxLength(500)
  message: string;

  @ApiPropertyOptional({ example: { orderId: 'uuid' } })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'IN_APP' })
  @IsOptional()
  @IsString()
  channel?: string;
}
