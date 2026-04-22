import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { FarmersService } from '../farmers.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { UserRole } from '@prisma/client';

const mockPrisma = {
  farmer: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

const mockFarmer = {
  id: 'farmer-uuid-123',
  userId: 'user-uuid-123',
  businessName: 'باغ سیب طلایی',
  description: 'توضیحات',
  farmLocation: 'اصفهان',
  farmLat: 31.9244,
  farmLng: 51.8678,
  iban: null,
  cardNumber: null,
  ratingAvg: 4.5,
  ratingCount: 10,
  totalSales: 1000000,
  commissionRate: null,
  verifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('FarmersService', () => {
  let service: FarmersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FarmersService>(FarmersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // findAll
  // ============================================
  describe('findAll()', () => {
    beforeEach(() => {
      mockPrisma.farmer.findMany.mockResolvedValue([mockFarmer]);
      mockPrisma.farmer.count.mockResolvedValue(1);
    });

    it('should return paginated farmers', async () => {
      const result = await service.findAll({ page: 1, pageSize: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should search by businessName or farmLocation', async () => {
      await service.findAll({ search: 'باغ' });

      expect(mockPrisma.farmer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ businessName: { contains: 'باغ' } }]),
          }),
        }),
      );
    });

    it('should order by ratingAvg desc', async () => {
      await service.findAll({});

      expect(mockPrisma.farmer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { ratingAvg: 'desc' },
        }),
      );
    });
  });

  // ============================================
  // findById
  // ============================================
  describe('findById()', () => {
    it('should return farmer by id', async () => {
      mockPrisma.farmer.findFirst.mockResolvedValue({
        ...mockFarmer,
        certificates: [],
        user: { id: 'user-uuid-123', firstName: 'محمد', lastName: 'باغدار' },
      });

      const result = await service.findById('farmer-uuid-123');

      expect(result.id).toBe('farmer-uuid-123');
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.farmer.findFirst.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================
  // getMyProfile
  // ============================================
  describe('getMyProfile()', () => {
    it('should return farmer profile for user', async () => {
      mockPrisma.farmer.findUnique.mockResolvedValue({
        ...mockFarmer,
        certificates: [],
        user: { id: 'user-uuid-123', phone: '09111111111' },
      });

      const result = await service.getMyProfile('user-uuid-123');

      expect(result.userId).toBe('user-uuid-123');
    });

    it('should throw if farmer profile not found', async () => {
      mockPrisma.farmer.findUnique.mockResolvedValue(null);

      await expect(service.getMyProfile('user-uuid-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================
  // updateProfile
  // ============================================
  describe('updateProfile()', () => {
    beforeEach(() => {
      mockPrisma.farmer.findUnique.mockResolvedValue(mockFarmer);
      mockPrisma.farmer.update.mockResolvedValue({
        ...mockFarmer,
        businessName: 'باغ جدید',
      });
    });

    it('should update farmer profile', async () => {
      const result = await service.updateProfile('user-uuid-123', {
        businessName: 'باغ جدید',
      });

      expect(result.businessName).toBe('باغ جدید');
      expect(mockPrisma.farmer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-uuid-123' },
        }),
      );
    });

    it('should throw if farmer not found', async () => {
      mockPrisma.farmer.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile('user-uuid-123', { businessName: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // verifyFarmer
  // ============================================
  describe('verifyFarmer()', () => {
    it('should verify farmer successfully', async () => {
      mockPrisma.farmer.findFirst.mockResolvedValue(mockFarmer);
      mockPrisma.farmer.update.mockResolvedValue({
        ...mockFarmer,
        verifiedAt: new Date(),
      });

      const result = await service.verifyFarmer('farmer-uuid-123');

      expect(result.verifiedAt).toBeDefined();
      expect(mockPrisma.farmer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { verifiedAt: expect.any(Date) },
        }),
      );
    });

    it('should throw if farmer not found', async () => {
      mockPrisma.farmer.findFirst.mockResolvedValue(null);

      await expect(service.verifyFarmer('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================
  // checkIsFarmer
  // ============================================
  describe('checkIsFarmer()', () => {
    it('should pass if user is farmer', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: UserRole.FARMER,
      });

      await expect(
        service.checkIsFarmer('user-uuid-123'),
      ).resolves.not.toThrow();
    });

    it('should throw ForbiddenException if user is not farmer', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: UserRole.BUYER,
      });

      await expect(service.checkIsFarmer('user-uuid-123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
