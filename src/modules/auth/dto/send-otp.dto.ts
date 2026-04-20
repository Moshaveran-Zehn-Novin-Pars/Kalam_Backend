import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({
    example: '09123456789',
    description: 'شماره موبایل ایرانی',
  })
  @IsString()
  @Matches(/^09[0-9]{9}$/, {
    message: 'شماره موبایل باید با 09 شروع شده و 11 رقم باشد',
  })
  phone: string;
}
