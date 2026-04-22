import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsString, MaxLength } from 'class-validator';

export class CreateDisputeDto {
  @ApiProperty({ example: 'order-uuid' })
  @IsUUID()
  orderId: string;

  @ApiProperty({ example: 'محصول با کیفیت اعلام شده مطابقت نداشت' })
  @IsString()
  @MaxLength(200)
  reason: string;

  @ApiProperty({ example: 'توضیحات کامل مشکل...' })
  @IsString()
  @MaxLength(2000)
  description: string;
}
