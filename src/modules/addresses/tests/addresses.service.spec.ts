import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { AddressesService } from '../addresses.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

// ============================================
// Mocks
// ============================================
const mockPrisma = {
  address: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
};

// ============================================
// Test Data
// ============================================
const mockAddress = {
  id: 'addr-uuid-123',
  userId: 'user-uuid-123',
  title: 'انبار اصلی',
  fullAddress: 'تهران، خیابان ولیعصر، پلاک ۱۲۳',
  province: 'تهران',
  city: 'تهران',
  postalCode: '1234567890',
  lat: 35.6892,
  lng: 51.389,
  receiverName: 'علی محمدی',
  receiverPhone: '09123456789',
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockCreateDto = {
  title: 'انبار اصلی',
  fullAddress: 'تهران، خیابان ولیعصر، پلاک ۱۲۳',
  province: 'تهران',
  city: 'تهران',
  lat: 35.6892,
  lng: 51.389,
  receiverName: 'علی محمدی',
  receiverPhone: '09123456789',
};

// ============================================
// Tests
// ============================================
describe('AddressesService', () => {
  let service: AddressesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AddressesService>(AddressesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // findAll
  // ============================================
  describe('findAll()', () => {
    it('should return all addresses for user', async () => {
      mockPrisma.address.findMany.mockResolvedValue([mockAddress]);

      const result = await service.findAll('user-uuid-123');

      expect(result).toHaveLength(1);
      expect(mockPrisma.address.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-uuid-123', deletedAt: null },
        }),
      );
    });

    it('should return empty array if no addresses', async () => {
      mockPrisma.address.findMany.mockResolvedValue([]);

      const result = await service.findAll('user-uuid-123');

      expect(result).toHaveLength(0);
    });

    it('should order by isDefault desc then createdAt desc', async () => {
      mockPrisma.address.findMany.mockResolvedValue([mockAddress]);

      await service.findAll('user-uuid-123');

      expect(mockPrisma.address.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        }),
      );
    });
  });

  // ============================================
  // findOne
  // ============================================
  describe('findOne()', () => {
    it('should return address if found and owned by user', async () => {
      mockPrisma.address.findFirst.mockResolvedValue(mockAddress);

      const result = await service.findOne('user-uuid-123', 'addr-uuid-123');

      expect(result.id).toBe('addr-uuid-123');
    });

    it('should throw NotFoundException if address not found', async () => {
      mockPrisma.address.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('user-uuid-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if address belongs to another user', async () => {
      mockPrisma.address.findFirst.mockResolvedValue({
        ...mockAddress,
        userId: 'other-user-id',
      });

      await expect(
        service.findOne('user-uuid-123', 'addr-uuid-123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================
  // create
  // ============================================
  describe('create()', () => {
    beforeEach(() => {
      mockPrisma.address.count.mockResolvedValue(0);
      mockPrisma.address.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.address.create.mockResolvedValue(mockAddress);
    });

    it('should create address successfully', async () => {
      const result = await service.create('user-uuid-123', mockCreateDto);

      expect(mockPrisma.address.create).toHaveBeenCalled();
      expect(result.id).toBe('addr-uuid-123');
    });

    it('should set isDefault=true for first address', async () => {
      mockPrisma.address.count.mockResolvedValue(0);

      await service.create('user-uuid-123', mockCreateDto);

      expect(mockPrisma.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDefault: true }),
        }),
      );
    });

    it('should not set isDefault for subsequent addresses without flag', async () => {
      mockPrisma.address.count.mockResolvedValue(2);

      await service.create('user-uuid-123', {
        ...mockCreateDto,
        isDefault: false,
      });

      expect(mockPrisma.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDefault: false }),
        }),
      );
    });

    it('should remove default from others when isDefault=true', async () => {
      mockPrisma.address.count.mockResolvedValue(2);

      await service.create('user-uuid-123', {
        ...mockCreateDto,
        isDefault: true,
      });

      expect(mockPrisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-123', isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
    });

    it('should throw BadRequestException when max addresses reached', async () => {
      mockPrisma.address.count.mockResolvedValue(10);

      await expect(
        service.create('user-uuid-123', mockCreateDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // update
  // ============================================
  describe('update()', () => {
    beforeEach(() => {
      mockPrisma.address.findFirst.mockResolvedValue(mockAddress);
      mockPrisma.address.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.address.update.mockResolvedValue({
        ...mockAddress,
        title: 'انبار جدید',
      });
    });

    it('should update address successfully', async () => {
      const result = await service.update('user-uuid-123', 'addr-uuid-123', {
        title: 'انبار جدید',
      });

      expect(result.title).toBe('انبار جدید');
      expect(mockPrisma.address.update).toHaveBeenCalled();
    });

    it('should throw if address not found', async () => {
      mockPrisma.address.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-uuid-123', 'non-existent', { title: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle isDefault change', async () => {
      mockPrisma.address.findFirst.mockResolvedValue({
        ...mockAddress,
        isDefault: false,
      });

      await service.update('user-uuid-123', 'addr-uuid-123', {
        isDefault: true,
      });

      expect(mockPrisma.address.updateMany).toHaveBeenCalled();
    });
  });

  // ============================================
  // setDefault
  // ============================================
  describe('setDefault()', () => {
    beforeEach(() => {
      mockPrisma.address.findFirst.mockResolvedValue(mockAddress);
      mockPrisma.address.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.address.update.mockResolvedValue({
        ...mockAddress,
        isDefault: true,
      });
    });

    it('should set default address successfully', async () => {
      const result = await service.setDefault('user-uuid-123', 'addr-uuid-123');

      expect(result.message).toBe('آدرس پیش‌فرض با موفقیت تنظیم شد');
      expect(mockPrisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-123', isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
      expect(mockPrisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-uuid-123' },
        data: { isDefault: true },
      });
    });

    it('should throw if address not found', async () => {
      mockPrisma.address.findFirst.mockResolvedValue(null);

      await expect(
        service.setDefault('user-uuid-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // remove
  // ============================================
  describe('remove()', () => {
    beforeEach(() => {
      mockPrisma.address.findFirst.mockResolvedValue(mockAddress);
      mockPrisma.address.update.mockResolvedValue({
        ...mockAddress,
        deletedAt: new Date(),
      });
      mockPrisma.address.findFirst
        .mockResolvedValueOnce(mockAddress)
        .mockResolvedValueOnce(null);
    });

    it('should soft delete address successfully', async () => {
      const result = await service.remove('user-uuid-123', 'addr-uuid-123');

      expect(result.message).toBe('آدرس با موفقیت حذف شد');
      expect(mockPrisma.address.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('should throw if address not found', async () => {
      mockPrisma.address.findFirst.mockReset();
      mockPrisma.address.findFirst.mockResolvedValue(null);

      await expect(
        service.remove('user-uuid-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
