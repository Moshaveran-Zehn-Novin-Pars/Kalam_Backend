import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { UserRole, UserStatus, KycStatus } from '@prisma/client';

const mockAuthService = {
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  refreshToken: jest.fn(),
  logout: jest.fn(),
  getMe: jest.fn(),
};

const mockUser = {
  id: 'user-uuid-123',
  phone: '09111111111',
  role: UserRole.FARMER,
  status: UserStatus.ACTIVE,
  sessionId: 'session-uuid-123',
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sendOtp()', () => {
    it('should call authService.sendOtp with phone', async () => {
      mockAuthService.sendOtp.mockResolvedValue({
        message: 'کد تایید ارسال شد',
        expiresIn: 120,
      });

      const result = await controller.sendOtp({ phone: '09111111111' });

      expect(mockAuthService.sendOtp).toHaveBeenCalledWith('09111111111');
      expect(result.message).toBe('کد تایید ارسال شد');
    });
  });

  describe('verifyOtp()', () => {
    it('should call authService.verifyOtp and return tokens', async () => {
      mockAuthService.verifyOtp.mockResolvedValue({
        accessToken: 'mock-token',
        refreshToken: 'mock-refresh',
        user: mockUser,
      });

      const mockReq = {
        headers: { 'user-agent': 'test' },
        ip: '127.0.0.1',
      } as import('express').Request;

      const result = await controller.verifyOtp(
        { phone: '09111111111', code: '123456' },
        mockReq,
      );

      expect(result.accessToken).toBe('mock-token');
    });
  });

  describe('logout()', () => {
    it('should call authService.logout with sessionId', async () => {
      mockAuthService.logout.mockResolvedValue({
        message: 'با موفقیت خارج شدید',
      });

      const result = await controller.logout(mockUser);

      expect(mockAuthService.logout).toHaveBeenCalledWith('session-uuid-123');
      expect(result.message).toBe('با موفقیت خارج شدید');
    });
  });

  describe('getMe()', () => {
    it('should return current user profile', async () => {
      mockAuthService.getMe.mockResolvedValue({
        ...mockUser,
        kycStatus: KycStatus.APPROVED,
      });

      const result = await controller.getMe(mockUser);

      expect(mockAuthService.getMe).toHaveBeenCalledWith('user-uuid-123');
      expect(result.phone).toBe('09111111111');
    });
  });
});
