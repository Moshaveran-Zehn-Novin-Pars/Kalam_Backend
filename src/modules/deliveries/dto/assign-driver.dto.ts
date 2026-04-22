import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignDriverDto {
  @ApiProperty({ example: 'driver-uuid' })
  @IsUUID()
  driverId: string;
}
