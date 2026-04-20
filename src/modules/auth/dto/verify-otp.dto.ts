import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, Length } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ example: '09123456789' })
  @IsString()
  @Matches(/^09[0-9]{9}$/, {
    message: 'شماره موبایل باید با 09 شروع شده و 11 رقم باشد',
  })
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 8, { message: 'کد OTP باید بین 4 تا 8 رقم باشد' })
  code: string;
}
