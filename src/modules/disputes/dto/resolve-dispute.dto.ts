import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class ResolveDisputeDto {
  @ApiProperty({ example: 'استرداد ۵۰٪ مبلغ به خریدار' })
  @IsString()
  @MaxLength(1000)
  resolution: string;
}
