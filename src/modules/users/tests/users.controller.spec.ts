import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';
import { UserRole, UserStatus, KycStatus } from '@prisma/client';

const mockUsersService = {
  findAll: jest.fn(),
  findById: jest.fn(),
  updateProfile: jest.fn(),
  suspendUser: jest.fn(),
  activateUser: jest.fn(),
  deleteUser: jest.fn(),
};

const mockAuthUser = {
  id: 'user-uuid-123',
  phone: '09111111111',
  role: UserRole.FARMER,
  status: UserStatus.ACTIVE,
  sessionId: 'session-uuid-123',
};

const mockAdminUser = {
  ...mockAuthUser,
  id: 'admin-uuid-123',
  role: UserRole.ADMIN,
};

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll()', () => {
    it('should return paginated users', async () => {
      mockUsersService.findAll.mockResolvedValue({
        items: [],
        meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      });

      const result = await controller.findAll({});

      expect(mockUsersService.findAll).toHaveBeenCalledWith({});
      expect(result.items).toEqual([]);
    });
  });

  describe('getProfile()', () => {
    it('should return current user profile', async () => {
      mockUsersService.findById.mockResolvedValue({
        id: mockAuthUser.id,
        phone: mockAuthUser.phone,
        role: UserRole.FARMER,
        kycStatus: KycStatus.APPROVED,
      });

      const result = await controller.getProfile(mockAuthUser);

      expect(mockUsersService.findById).toHaveBeenCalledWith('user-uuid-123');
      expect(result.phone).toBe('09111111111');
    });
  });

  describe('updateProfile()', () => {
    it('should update and return profile', async () => {
      mockUsersService.updateProfile.mockResolvedValue({
        id: mockAuthUser.id,
        firstName: 'علی',
      });

      const result = await controller.updateProfile(mockAuthUser, {
        firstName: 'علی',
      });

      expect(mockUsersService.updateProfile).toHaveBeenCalledWith(
        'user-uuid-123',
        { firstName: 'علی' },
      );
      expect(result.firstName).toBe('علی');
    });
  });

  describe('suspendUser()', () => {
    it('should suspend user', async () => {
      mockUsersService.suspendUser.mockResolvedValue({
        message: 'کاربر با موفقیت تعلیق شد',
      });

      const result = await controller.suspendUser(
        mockAdminUser,
        'user-uuid-123',
        'تخلف',
      );

      expect(result.message).toBe('کاربر با موفقیت تعلیق شد');
    });
  });

  describe('deleteUser()', () => {
    it('should delete user', async () => {
      mockUsersService.deleteUser.mockResolvedValue({
        message: 'کاربر با موفقیت حذف شد',
      });

      const result = await controller.deleteUser(
        mockAdminUser,
        'user-uuid-123',
      );

      expect(mockUsersService.deleteUser).toHaveBeenCalledWith(
        'admin-uuid-123',
        'user-uuid-123',
      );
      expect(result.message).toBe('کاربر با موفقیت حذف شد');
    });
  });
});
