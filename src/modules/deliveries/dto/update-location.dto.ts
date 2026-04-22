import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, Max } from 'class-validator';

export class UpdateLocationDto {
  @ApiProperty({ example: 35.6892 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 51.389 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}
