import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateOrderDto {
  @ApiProperty({ example: 'address-uuid' })
  @IsUUID()
  addressId: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.ONLINE_GATEWAY })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ example: '2026-05-01T10:00:00Z' })
  @IsOptional()
  @IsDateString()
  requestedDeliveryAt?: string;

  @ApiPropertyOptional({ example: 'لطفاً محصولات تازه باشند' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
