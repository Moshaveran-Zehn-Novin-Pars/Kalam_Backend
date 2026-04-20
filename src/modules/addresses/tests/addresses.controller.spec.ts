import { Test, TestingModule } from '@nestjs/testing';
import { AddressesController } from '../addresses.controller';
import { AddressesService } from '../addresses.service';
import { UserRole, UserStatus } from '@prisma/client';

const mockAddressesService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  setDefault: jest.fn(),
  remove: jest.fn(),
};

const mockUser = {
  id: 'user-uuid-123',
  phone: '09111111111',
  role: UserRole.BUYER,
  status: UserStatus.ACTIVE,
  sessionId: 'session-uuid-123',
};

const mockAddress = {
  id: 'addr-uuid-123',
  userId: 'user-uuid-123',
  title: 'انبار اصلی',
  fullAddress: 'تهران، خیابان ولیعصر، پلاک ۱۲۳',
  province: 'تهران',
  city: 'تهران',
  lat: 35.6892,
  lng: 51.389,
  receiverName: 'علی محمدی',
  receiverPhone: '09123456789',
  isDefault: true,
};

describe('AddressesController', () => {
  let controller: AddressesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AddressesController],
      providers: [
        { provide: AddressesService, useValue: mockAddressesService },
      ],
    }).compile();

    controller = module.get<AddressesController>(AddressesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll()', () => {
    it('should return all addresses for current user', async () => {
      mockAddressesService.findAll.mockResolvedValue([mockAddress]);

      const result = await controller.findAll(mockUser);

      expect(mockAddressesService.findAll).toHaveBeenCalledWith(
        'user-uuid-123',
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne()', () => {
    it('should return one address', async () => {
      mockAddressesService.findOne.mockResolvedValue(mockAddress);

      const result = await controller.findOne(mockUser, 'addr-uuid-123');

      expect(mockAddressesService.findOne).toHaveBeenCalledWith(
        'user-uuid-123',
        'addr-uuid-123',
      );
      expect(result.id).toBe('addr-uuid-123');
    });
  });

  describe('create()', () => {
    it('should create address', async () => {
      mockAddressesService.create.mockResolvedValue(mockAddress);

      const result = await controller.create(mockUser, {
        title: 'انبار اصلی',
        fullAddress: 'تهران',
        province: 'تهران',
        city: 'تهران',
        lat: 35.6892,
        lng: 51.389,
        receiverName: 'علی',
        receiverPhone: '09123456789',
      });

      expect(mockAddressesService.create).toHaveBeenCalledWith(
        'user-uuid-123',
        expect.any(Object),
      );
      expect(result.id).toBe('addr-uuid-123');
    });
  });

  describe('update()', () => {
    it('should update address', async () => {
      mockAddressesService.update.mockResolvedValue({
        ...mockAddress,
        title: 'انبار جدید',
      });

      const result = await controller.update(mockUser, 'addr-uuid-123', {
        title: 'انبار جدید',
      });

      expect(result.title).toBe('انبار جدید');
    });
  });

  describe('setDefault()', () => {
    it('should set default address', async () => {
      mockAddressesService.setDefault.mockResolvedValue({
        message: 'آدرس پیش‌فرض با موفقیت تنظیم شد',
      });

      const result = await controller.setDefault(mockUser, 'addr-uuid-123');

      expect(result.message).toBe('آدرس پیش‌فرض با موفقیت تنظیم شد');
    });
  });

  describe('remove()', () => {
    it('should remove address', async () => {
      mockAddressesService.remove.mockResolvedValue({
        message: 'آدرس با موفقیت حذف شد',
      });

      const result = await controller.remove(mockUser, 'addr-uuid-123');

      expect(result.message).toBe('آدرس با موفقیت حذف شد');
    });
  });
});
