import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsNumber,
  IsDateString,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateAuctionDto {
  @ApiProperty({ example: 'product-uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 10000 })
  @IsNumber()
  @Min(0)
  startingPrice: number;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minBidIncrement?: number;

  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @IsNumber()
  reservePrice?: number;

  @ApiProperty({ example: '2026-05-01T10:00:00Z' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2026-05-03T10:00:00Z' })
  @IsDateString()
  endTime: string;
}
