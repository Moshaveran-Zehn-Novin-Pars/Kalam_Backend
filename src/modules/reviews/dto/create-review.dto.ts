import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsInt,
  IsString,
  IsOptional,
  IsEnum,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export enum ReviewType {
  BUYER_REVIEWS_FARMER = 'BUYER_REVIEWS_FARMER',
  FARMER_REVIEWS_BUYER = 'FARMER_REVIEWS_BUYER',
}

export class CreateReviewDto {
  @ApiProperty({ example: 'order-uuid' })
  @IsUUID()
  orderId: string;

  @ApiProperty({ example: 'target-user-uuid' })
  @IsUUID()
  targetId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'محصول با کیفیت بود' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiProperty({ enum: ReviewType })
  @IsEnum(ReviewType)
  type: ReviewType;
}
