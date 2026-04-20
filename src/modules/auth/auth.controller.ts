import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from './strategies/jwt.strategy';
import { SendOtpDto, VerifyOtpDto, RefreshTokenDto } from './dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ارسال کد تایید به موبایل' })
  @ApiResponse({ status: 200, description: 'کد تایید ارسال شد' })
  @ApiResponse({
    status: 400,
    description: 'شماره موبایل نامعتبر یا rate limit',
  })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto.phone);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تایید کد OTP و دریافت توکن' })
  @ApiResponse({ status: 200, description: 'ورود موفق' })
  @ApiResponse({ status: 400, description: 'کد نامعتبر' })
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.authService.verifyOtp(
      dto.phone,
      dto.code,
      req.headers['user-agent'],
      req.ip,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تجدید توکن دسترسی' })
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'خروج از حساب کاربری' })
  logout(@CurrentUser() user: AuthUser) {
    return this.authService.logout(user.sessionId);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'اطلاعات کاربر جاری' })
  getMe(@CurrentUser() user: AuthUser) {
    return this.authService.getMe(user.id);
  }
}
