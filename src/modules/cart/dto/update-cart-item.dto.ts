import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class UpdateCartItemDto {
  @ApiProperty({ example: 300 })
  @IsNumber()
  @Min(1)
  quantity: number;
}
