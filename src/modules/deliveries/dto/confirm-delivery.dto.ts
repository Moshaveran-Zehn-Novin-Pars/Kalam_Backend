import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ConfirmDeliveryDto {
  @ApiPropertyOptional({ example: 'https://storage.example.com/proof.jpg' })
  @IsOptional()
  @IsString()
  proofImage?: string;

  @ApiPropertyOptional({ example: 'https://storage.example.com/signature.jpg' })
  @IsOptional()
  @IsString()
  signatureImage?: string;

  @ApiPropertyOptional({ example: 'علی محمدی' })
  @IsOptional()
  @IsString()
  recipientName?: string;
}
