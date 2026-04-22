import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CommissionsService } from '../commissions.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const mockPrisma = {
  commissionRule: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  product: {
    findUnique: jest.fn(),
  },
  order: {
    findMany: jest.fn(),
  },
};

const mockRule = {
  id: 'rule-uuid-123',
  categoryId: 'cat-uuid-123',
  farmerId: null,
  rate: 0.06,
  minAmount: null,
  maxAmount: null,
  validFrom: new Date('2026-01-01'),
  validTo: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CommissionsService', () => {
  let service: CommissionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommissionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CommissionsService>(CommissionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // findAll
  // ============================================
  describe('findAll()', () => {
    it('should return all active rules', async () => {
      mockPrisma.commissionRule.findMany.mockResolvedValue([mockRule]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(mockPrisma.commissionRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        }),
      );
    });
  });

  // ============================================
  // getRateForProduct
  // ============================================
  describe('getRateForProduct()', () => {
    it('should return farmer override rate if exists', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-uuid-123',
        farmer: { commissionRate: { toNumber: () => 0.04 } },
        category: { commissionRate: { toNumber: () => 0.06 } },
      });

      const rate = await service.getRateForProduct('prod-uuid-123');

      expect(rate).toBe(0.04);
    });

    it('should return category rate if no farmer override', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-uuid-123',
        farmer: { commissionRate: null },
        category: { commissionRate: { toNumber: () => 0.07 } },
      });

      const rate = await service.getRateForProduct('prod-uuid-123');

      expect(rate).toBe(0.07);
    });

    it('should return default rate if product not found', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      const rate = await service.getRateForProduct('non-existent');

      expect(rate).toBe(0.06);
    });
  });

  // ============================================
  // createRule
  // ============================================
  describe('createRule()', () => {
    it('should create commission rule', async () => {
      mockPrisma.commissionRule.create.mockResolvedValue(mockRule);

      const result = await service.createRule({
        categoryId: 'cat-uuid-123',
        rate: 0.06,
        validFrom: new Date('2026-01-01'),
      });

      expect(result.id).toBe('rule-uuid-123');
      expect(mockPrisma.commissionRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rate: 0.06,
            isActive: true,
          }),
        }),
      );
    });
  });

  // ============================================
  // updateRule
  // ============================================
  describe('updateRule()', () => {
    it('should update commission rule', async () => {
      mockPrisma.commissionRule.findUnique.mockResolvedValue(mockRule);
      mockPrisma.commissionRule.update.mockResolvedValue({
        ...mockRule,
        rate: 0.08,
      });

      await service.updateRule('rule-uuid-123', { rate: 0.08 });

      expect(mockPrisma.commissionRule.update).toHaveBeenCalled();
    });

    it('should throw if rule not found', async () => {
      mockPrisma.commissionRule.findUnique.mockResolvedValue(null);

      await expect(
        service.updateRule('non-existent', { rate: 0.08 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // getStats
  // ============================================
  describe('getStats()', () => {
    it('should return commission stats', async () => {
      mockPrisma.order.findMany.mockResolvedValue([
        {
          commissionTotal: { toNumber: () => 540000 },
          total: { toNumber: () => 9000000 },
          createdAt: new Date(),
        },
        {
          commissionTotal: { toNumber: () => 270000 },
          total: { toNumber: () => 4500000 },
          createdAt: new Date(),
        },
      ]);

      const result = await service.getStats(
        new Date('2026-01-01'),
        new Date('2026-12-31'),
      );

      expect(result.totalCommission).toBe(810000);
      expect(result.totalRevenue).toBe(13500000);
      expect(result.orderCount).toBe(2);
    });

    it('should return zero stats if no orders', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);

      const result = await service.getStats(
        new Date('2026-01-01'),
        new Date('2026-12-31'),
      );

      expect(result.totalCommission).toBe(0);
      expect(result.avgCommissionRate).toBe(0);
    });
  });
});
