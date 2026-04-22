import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class WalletDepositDto {
  @ApiProperty({ example: 5000000 })
  @IsNumber()
  @Min(10000)
  amount: number;
}
