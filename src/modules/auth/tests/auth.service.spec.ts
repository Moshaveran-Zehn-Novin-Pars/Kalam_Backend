import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { AppConfigService } from '../../../config';
import { UserRole, UserStatus, KycStatus } from '@prisma/client';
import * as crypto from 'crypto';

// ============================================
// Mocks
// ============================================
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  wallet: {
    create: jest.fn(),
  },
  otpCode: {
    create: jest.fn(),
  },
  session: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockRedis = {
  exists: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
};

const mockJwtService = {
  signAsync: jest.fn().mockResolvedValue('mock-access-token'),
};

const mockConfig = {
  otpExpiresSeconds: 120,
  otpMaxAttempts: 5,
  otpLength: 6,
  jwtAccessExpires: '15m',
  isDevelopment: true,
};

// ============================================
// Test Data
// ============================================
const mockUser = {
  id: 'user-uuid-123',
  phone: '09111111111',
  email: null,
  firstName: 'محمد',
  lastName: 'باغدار',
  role: UserRole.FARMER,
  status: UserStatus.ACTIVE,
  kycStatus: KycStatus.APPROVED,
  avatar: null,
  referralCode: null,
  referredBy: null,
  nationalCode: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockSession = {
  id: 'session-uuid-123',
  userId: mockUser.id,
  refreshToken: 'mock-refresh-token',
  userAgent: 'test-agent',
  ip: '127.0.0.1',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  revokedAt: null,
  createdAt: new Date(),
};

// ============================================
// Tests
// ============================================
describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AppConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // sendOtp
  // ============================================
  describe('sendOtp()', () => {
    beforeEach(() => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(undefined);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(undefined);
      mockPrisma.otpCode.create.mockResolvedValue({});
    });

    it('should send OTP successfully', async () => {
      const result = await service.sendOtp('09111111111');

      expect(result.message).toBe('کد تایید ارسال شد');
      expect(result.expiresIn).toBe(120);
      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockPrisma.otpCode.create).toHaveBeenCalled();
    });

    it('should throw if phone is blocked', async () => {
      mockRedis.exists.mockResolvedValue(true);
      mockRedis.ttl.mockResolvedValue(600);

      await expect(service.sendOtp('09111111111')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if rate limit exceeded', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('3');

      await expect(service.sendOtp('09111111111')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should save OTP to Redis with TTL', async () => {
      await service.sendOtp('09111111111');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'otp:09111111111',
        expect.any(String),
        120,
      );
    });
  });

  // ============================================
  // verifyOtp
  // ============================================
  describe('verifyOtp()', () => {
    const validOtp = '123456';
    let hashedOtp: string;

    beforeEach(() => {
      hashedOtp = crypto.createHash('sha256').update(validOtp).digest('hex');

      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ code: hashedOtp, phone: '09111111111' }),
      );
      mockRedis.del.mockResolvedValue(undefined);
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.set.mockResolvedValue(undefined);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.session.create.mockResolvedValue(mockSession);
    });

    it('should verify OTP and return tokens for existing user', async () => {
      const result = await service.verifyOtp(
        '09111111111',
        validOtp,
        'test-agent',
        '127.0.0.1',
      );

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.user.phone).toBe('09111111111');
    });

    it('should create new user if not exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        ...mockUser,
        role: UserRole.BUYER,
      });
      mockPrisma.wallet.create.mockResolvedValue({});
      mockPrisma.session.create.mockResolvedValue(mockSession);

      const result = await service.verifyOtp('09999999999', validOtp);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: '09999999999',
            role: UserRole.BUYER,
          }),
        }),
      );
      expect(mockPrisma.wallet.create).toHaveBeenCalled();
      expect(result.accessToken).toBeDefined();
    });

    it('should throw if OTP is expired or not sent', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.verifyOtp('09111111111', validOtp)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if OTP is wrong', async () => {
      mockRedis.incr.mockResolvedValue(1);

      await expect(service.verifyOtp('09111111111', '000000')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should block user after max attempts', async () => {
      mockRedis.incr.mockResolvedValue(5);

      await expect(service.verifyOtp('09111111111', '000000')).rejects.toThrow(
        'تعداد تلاش‌های مجاز تمام شد',
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        'otp:block:09111111111',
        '1',
        900,
      );
    });

    it('should throw if user is suspended', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: UserStatus.SUSPENDED,
      });

      await expect(service.verifyOtp('09111111111', validOtp)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should clean up OTP from Redis after successful verify', async () => {
      await service.verifyOtp('09111111111', validOtp);

      expect(mockRedis.del).toHaveBeenCalledWith('otp:09111111111');
      expect(mockRedis.del).toHaveBeenCalledWith('otp:attempts:09111111111');
    });
  });

  // ============================================
  // refreshToken
  // ============================================
  describe('refreshToken()', () => {
    beforeEach(() => {
      mockPrisma.session.findUnique.mockResolvedValue({
        ...mockSession,
        user: mockUser,
      });
      mockPrisma.session.update.mockResolvedValue({});
      mockRedis.set.mockResolvedValue(undefined);
    });

    it('should refresh token successfully', async () => {
      const result = await service.refreshToken('mock-refresh-token');

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(mockPrisma.session.update).toHaveBeenCalled();
    });

    it('should throw if refresh token not found', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw if session is revoked', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        ...mockSession,
        user: mockUser,
        revokedAt: new Date(),
      });

      await expect(service.refreshToken('mock-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw if session is expired', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        ...mockSession,
        user: mockUser,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refreshToken('mock-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should rotate refresh token on each refresh', async () => {
      const result1 = await service.refreshToken('mock-refresh-token');
      const result2 = await service.refreshToken('mock-refresh-token');

      expect(result1.refreshToken).not.toBe('mock-refresh-token');
      expect(result2.refreshToken).not.toBe('mock-refresh-token');
    });
  });

  // ============================================
  // logout
  // ============================================
  describe('logout()', () => {
    beforeEach(() => {
      mockPrisma.session.update.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);
    });

    it('should logout successfully', async () => {
      const result = await service.logout('session-uuid-123');

      expect(result.message).toBe('با موفقیت خارج شدید');
      expect(mockPrisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-uuid-123' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockRedis.del).toHaveBeenCalledWith('session:session-uuid-123');
    });
  });

  // ============================================
  // getMe
  // ============================================
  describe('getMe()', () => {
    it('should return user profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        farmer: { id: 'farmer-id', businessName: 'باغ سیب' },
        buyer: null,
        driver: null,
      });

      const result = await service.getMe('user-uuid-123');

      expect(result.phone).toBe('09111111111');
      expect(result.farmer).toBeDefined();
    });

    it('should throw if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('non-existent-id')).rejects.toThrow(
        'کاربر یافت نشد',
      );
    });
  });
});
