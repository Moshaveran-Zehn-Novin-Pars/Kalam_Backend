import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class PlaceBidDto {
  @ApiProperty({ example: 50000 })
  @IsNumber()
  @Min(1)
  amount: number;
}
