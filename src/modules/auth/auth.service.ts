import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AppConfigService } from '../../config';
import { JwtPayload } from './strategies/jwt.strategy';
import { UserRole, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  // ============================================
  // OTP Keys
  // ============================================
  private otpKey(phone: string) {
    return `otp:${phone}`;
  }

  private otpAttemptsKey(phone: string) {
    return `otp:attempts:${phone}`;
  }

  private otpBlockKey(phone: string) {
    return `otp:block:${phone}`;
  }

  // ============================================
  // Send OTP
  // ============================================
  async sendOtp(
    phone: string,
  ): Promise<{ message: string; expiresIn: number }> {
    // Check if blocked
    const isBlocked = await this.redis.exists(this.otpBlockKey(phone));
    if (isBlocked) {
      const ttl = await this.redis.ttl(this.otpBlockKey(phone));
      throw new BadRequestException(
        `تعداد تلاش‌های مجاز تمام شده. ${Math.ceil(ttl / 60)} دقیقه دیگر تلاش کنید`,
      );
    }

    // Check rate limit (max 3 OTP per 5 minutes)
    const rateLimitKey = `otp:rate:${phone}`;
    const rateCount = await this.redis.get(rateLimitKey);
    if (rateCount && parseInt(rateCount) >= 3) {
      throw new BadRequestException(
        'درخواست بیش از حد مجاز. لطفاً چند دقیقه دیگر تلاش کنید',
      );
    }

    // Generate OTP
    const otp = this.generateOtp();
    const hashedOtp = this.hashOtp(otp);
    const expiresIn = this.config.otpExpiresSeconds;

    // Save to Redis
    await this.redis.set(
      this.otpKey(phone),
      JSON.stringify({ code: hashedOtp, phone }),
      expiresIn,
    );

    // Rate limiting
    await this.redis.incr(rateLimitKey);
    await this.redis.expire(rateLimitKey, 5 * 60);

    // Save to DB for audit
    await this.prisma.otpCode.create({
      data: {
        phone,
        code: hashedOtp,
        purpose: 'LOGIN',
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });

    // TODO: Send via SMS (Kavenegar)
    // In development, log the OTP
    if (this.config.isDevelopment) {
      this.logger.debug(`📱 OTP for ${phone}: ${otp}`);
    }

    return {
      message: 'کد تایید ارسال شد',
      expiresIn,
    };
  }

  // ============================================
  // Verify OTP
  // ============================================
  async verifyOtp(
    phone: string,
    code: string,
    userAgent?: string,
    ip?: string,
  ) {
    // Check if blocked
    const isBlocked = await this.redis.exists(this.otpBlockKey(phone));
    if (isBlocked) {
      throw new BadRequestException('حساب موقتاً مسدود شده است');
    }

    // Get OTP from Redis
    const otpData = await this.redis.get(this.otpKey(phone));
    if (!otpData) {
      throw new BadRequestException('کد تایید منقضی شده یا ارسال نشده است');
    }

    const { code: hashedCode } = JSON.parse(otpData) as {
      code: string;
      phone: string;
    };

    // Verify code
    const hashedInput = this.hashOtp(code);
    if (hashedInput !== hashedCode) {
      // Increment attempts
      const attemptsKey = this.otpAttemptsKey(phone);
      const attempts = await this.redis.incr(attemptsKey);
      await this.redis.expire(attemptsKey, this.config.otpExpiresSeconds);

      const maxAttempts = this.config.otpMaxAttempts;
      const remaining = maxAttempts - attempts;

      if (attempts >= maxAttempts) {
        // Block for 15 minutes
        await this.redis.set(this.otpBlockKey(phone), '1', 15 * 60);
        await this.redis.del(this.otpKey(phone));
        throw new BadRequestException(
          'تعداد تلاش‌های مجاز تمام شد. ۱۵ دقیقه دیگر تلاش کنید',
        );
      }

      throw new BadRequestException(
        `کد تایید اشتباه است. ${remaining} تلاش باقی مانده`,
      );
    }

    // OTP is valid - clean up
    await this.redis.del(this.otpKey(phone));
    await this.redis.del(this.otpAttemptsKey(phone));

    // Find or create user
    let user = await this.prisma.user.findUnique({ where: { phone } });

    if (!user) {
      // Auto-register new user
      user = await this.prisma.user.create({
        data: {
          phone,
          role: UserRole.BUYER,
          status: UserStatus.ACTIVE,
        },
      });

      // Create wallet for new user
      await this.prisma.wallet.create({
        data: { userId: user.id, currency: 'IRR' },
      });

      this.logger.log(`New user registered: ${phone}`);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('حساب کاربری غیرفعال است');
    }

    // Create session
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: crypto.randomBytes(32).toString('hex'),
        userAgent: userAgent ?? null,
        ip: ip ?? null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(
      user.id,
      user.phone,
      user.role,
      session.id,
    );

    // Save refresh token in Redis
    await this.redis.set(
      `session:${session.id}`,
      session.refreshToken,
      30 * 24 * 60 * 60,
    );

    this.logger.log(`User logged in: ${phone} (${user.role})`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: session.refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
      },
    };
  }

  // ============================================
  // Refresh Token
  // ============================================
  async refreshToken(refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedException('توکن نامعتبر است');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('نشست منقضی شده است');
    }

    if (session.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('حساب کاربری غیرفعال است');
    }

    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: newRefreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Update Redis
    await this.redis.set(
      `session:${session.id}`,
      newRefreshToken,
      30 * 24 * 60 * 60,
    );

    const tokens = await this.generateTokens(
      session.user.id,
      session.user.phone,
      session.user.role,
      session.id,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: newRefreshToken,
    };
  }

  // ============================================
  // Logout
  // ============================================
  async logout(sessionId: string): Promise<{ message: string }> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    await this.redis.del(`session:${sessionId}`);

    return { message: 'با موفقیت خارج شدید' };
  }

  // ============================================
  // Get Me
  // ============================================
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        kycStatus: true,
        avatar: true,
        createdAt: true,
        farmer: {
          select: {
            id: true,
            businessName: true,
            ratingAvg: true,
            verifiedAt: true,
          },
        },
        buyer: {
          select: {
            id: true,
            businessName: true,
            businessType: true,
            creditLimit: true,
          },
        },
        driver: {
          select: {
            id: true,
            vehicleType: true,
            isAvailable: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    return user;
  }

  // ============================================
  // Private Helpers
  // ============================================
  private generateOtp(): string {
    const length = this.config.otpLength;
    const max = Math.pow(10, length);
    const min = Math.pow(10, length - 1);
    return String(Math.floor(Math.random() * (max - min) + min));
  }

  private hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  private async generateTokens(
    userId: string,
    phone: string,
    role: UserRole,
    sessionId: string,
  ) {
    const payload: JwtPayload = {
      sub: userId,
      phone,
      role,
      sessionId,
    };

    const accessToken = await this.jwtService.signAsync(
      { ...payload },
      { expiresIn: this.config.jwtAccessExpires as unknown as number },
    );

    return { accessToken };
  }
}
