import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsDateString, Min } from 'class-validator';

export class ReserveWarehouseDto {
  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(1)
  quantityKg: number;

  @ApiProperty({ example: '2026-05-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-05-30' })
  @IsDateString()
  endDate: string;
}
