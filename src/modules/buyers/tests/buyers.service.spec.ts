import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BuyersService } from '../buyers.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const mockPrisma = {
  buyer: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockBuyer = {
  id: 'buyer-uuid-123',
  userId: 'user-uuid-123',
  businessName: 'سوپرمارکت ستاره',
  businessType: 'SUPERMARKET',
  economicCode: null,
  nationalId: null,
  creditLimit: 50000000,
  creditUsed: 0,
  ratingAvg: 4.2,
  ratingCount: 5,
  totalPurchases: 500000,
  verifiedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('BuyersService', () => {
  let service: BuyersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuyersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BuyersService>(BuyersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMyProfile()', () => {
    it('should return buyer profile', async () => {
      mockPrisma.buyer.findUnique.mockResolvedValue({
        ...mockBuyer,
        user: { id: 'user-uuid-123', phone: '09222222221' },
      });

      const result = await service.getMyProfile('user-uuid-123');

      expect(result.businessName).toBe('سوپرمارکت ستاره');
    });

    it('should throw if buyer not found', async () => {
      mockPrisma.buyer.findUnique.mockResolvedValue(null);

      await expect(service.getMyProfile('user-uuid-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile()', () => {
    beforeEach(() => {
      mockPrisma.buyer.findUnique.mockResolvedValue(mockBuyer);
      mockPrisma.buyer.update.mockResolvedValue({
        ...mockBuyer,
        businessName: 'هایپرمارکت ستاره',
      });
    });

    it('should update buyer profile', async () => {
      const result = await service.updateProfile('user-uuid-123', {
        businessName: 'هایپرمارکت ستاره',
      });

      expect(result.businessName).toBe('هایپرمارکت ستاره');
    });

    it('should throw if buyer not found', async () => {
      mockPrisma.buyer.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile('user-uuid-123', { businessName: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
