import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { UserRole, UserStatus, KycStatus } from '@prisma/client';

// ============================================
// Mocks
// ============================================
const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  session: {
    updateMany: jest.fn(),
  },
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
  nationalCode: '1234567890',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

// ============================================
// Tests
// ============================================
describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // findAll
  // ============================================
  describe('findAll()', () => {
    beforeEach(() => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      mockPrisma.user.count.mockResolvedValue(1);
    });

    it('should return paginated users', async () => {
      const result = await service.findAll({ page: 1, pageSize: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should filter by role', async () => {
      await service.findAll({ role: UserRole.FARMER });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: UserRole.FARMER }),
        }),
      );
    });

    it('should filter by status', async () => {
      await service.findAll({ status: UserStatus.ACTIVE });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: UserStatus.ACTIVE }),
        }),
      );
    });

    it('should search by phone or name', async () => {
      await service.findAll({ search: '09111' });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ phone: { contains: '09111' } }]),
          }),
        }),
      );
    });

    it('should calculate correct pagination', async () => {
      mockPrisma.user.count.mockResolvedValue(25);

      const result = await service.findAll({ page: 2, pageSize: 10 });

      expect(result.meta.totalPages).toBe(3);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  // ============================================
  // findById
  // ============================================
  describe('findById()', () => {
    it('should return user by id', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        farmer: null,
        buyer: null,
        driver: null,
        wallet: { balance: 0, currency: 'IRR' },
      });

      const result = await service.findById('user-uuid-123');

      expect(result.id).toBe('user-uuid-123');
      expect(result.phone).toBe('09111111111');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================
  // updateProfile
  // ============================================
  describe('updateProfile()', () => {
    beforeEach(() => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        firstName: 'علی',
      });
    });

    it('should update profile successfully', async () => {
      const result = await service.updateProfile('user-uuid-123', {
        firstName: 'علی',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-uuid-123' },
          data: expect.objectContaining({ firstName: 'علی' }),
        }),
      );
      expect(result.firstName).toBe('علی');
    });

    it('should throw if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.updateProfile('non-existent', { firstName: 'علی' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({ ...mockUser, id: 'other-user' });

      await expect(
        service.updateProfile('user-uuid-123', {
          email: 'existing@example.com',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow updating to same email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        email: 'same@example.com',
      });

      await service.updateProfile('user-uuid-123', {
        email: 'same@example.com',
      });

      expect(mockPrisma.user.update).toHaveBeenCalled();
    });
  });

  // ============================================
  // suspendUser
  // ============================================
  describe('suspendUser()', () => {
    beforeEach(() => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        status: UserStatus.SUSPENDED,
      });
      mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });
    });

    it('should suspend user successfully', async () => {
      const result = await service.suspendUser(
        'admin-uuid-123',
        'user-uuid-123',
        'تخلف',
      );

      expect(result.message).toBe('کاربر با موفقیت تعلیق شد');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: UserStatus.SUSPENDED },
        }),
      );
      expect(mockPrisma.session.updateMany).toHaveBeenCalled();
    });

    it('should throw if admin tries to suspend themselves', async () => {
      await expect(
        service.suspendUser('admin-uuid-123', 'admin-uuid-123', 'test'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if trying to suspend another admin', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        role: UserRole.ADMIN,
      });

      await expect(
        service.suspendUser('admin-uuid-123', 'other-admin-id', 'test'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.suspendUser('admin-uuid-123', 'non-existent', 'test'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should revoke all sessions on suspend', async () => {
      await service.suspendUser('admin-uuid-123', 'user-uuid-123', 'test');

      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-123', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  // ============================================
  // activateUser
  // ============================================
  describe('activateUser()', () => {
    it('should activate user successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        status: UserStatus.SUSPENDED,
      });
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        status: UserStatus.ACTIVE,
      });

      const result = await service.activateUser('user-uuid-123');

      expect(result.message).toBe('کاربر با موفقیت فعال شد');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: UserStatus.ACTIVE },
        }),
      );
    });

    it('should throw if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.activateUser('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================
  // deleteUser
  // ============================================
  describe('deleteUser()', () => {
    it('should soft delete user successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
      });

      const result = await service.deleteUser(
        'admin-uuid-123',
        'user-uuid-123',
      );

      expect(result.message).toBe('کاربر با موفقیت حذف شد');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('should throw if admin tries to delete themselves', async () => {
      await expect(
        service.deleteUser('admin-uuid-123', 'admin-uuid-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteUser('admin-uuid-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
