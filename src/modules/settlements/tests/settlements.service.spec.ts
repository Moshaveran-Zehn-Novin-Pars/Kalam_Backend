import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SettlementsService } from '../settlements.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const mockPrisma = {
  farmer: {
    findFirst: jest.fn(),
  },
  orderItem: {
    findMany: jest.fn(),
  },
  settlement: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  payout: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockFarmer = {
  id: 'farmer-uuid-123',
  userId: 'user-uuid-123',
  businessName: 'باغ سیب',
  iban: 'IR062960000000100324200001',
  deletedAt: null,
};

const mockSettlement = {
  id: 'settlement-uuid-123',
  farmerId: 'farmer-uuid-123',
  periodStart: new Date('2026-04-01'),
  periodEnd: new Date('2026-04-30'),
  grossAmount: { toNumber: () => 9000000 },
  commissionAmount: { toNumber: () => 540000 },
  taxes: { toNumber: () => 810000 },
  netAmount: { toNumber: () => 7650000 },
  status: 'PENDING',
  paidAt: null,
  createdAt: new Date(),
};

describe('SettlementsService', () => {
  let service: SettlementsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SettlementsService>(SettlementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // calculateForFarmer
  // ============================================
  describe('calculateForFarmer()', () => {
    beforeEach(() => {
      mockPrisma.farmer.findFirst.mockResolvedValue(mockFarmer);
      mockPrisma.orderItem.findMany.mockResolvedValue([
        {
          orderId: 'order-uuid-1',
          subtotal: { toNumber: () => 4500000 },
          commission: { toNumber: () => 270000 },
          order: { id: 'order-uuid-1', orderNumber: 'KLM-001' },
        },
        {
          orderId: 'order-uuid-2',
          subtotal: { toNumber: () => 4500000 },
          commission: { toNumber: () => 270000 },
          order: { id: 'order-uuid-2', orderNumber: 'KLM-002' },
        },
      ]);
    });

    it('should calculate settlement correctly', async () => {
      const result = await service.calculateForFarmer(
        'farmer-uuid-123',
        new Date('2026-04-01'),
        new Date('2026-04-30'),
      );

      expect(result.grossAmount).toBe(9000000);
      expect(result.commissionAmount).toBe(540000);
      expect(result.orderCount).toBe(2);
      expect(result.netAmount).toBeGreaterThan(0);
    });

    it('should throw if farmer not found', async () => {
      mockPrisma.farmer.findFirst.mockResolvedValue(null);

      await expect(
        service.calculateForFarmer(
          'non-existent',
          new Date('2026-04-01'),
          new Date('2026-04-30'),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // createSettlement
  // ============================================
  describe('createSettlement()', () => {
    beforeEach(() => {
      mockPrisma.farmer.findFirst.mockResolvedValue(mockFarmer);
      mockPrisma.orderItem.findMany.mockResolvedValue([
        {
          orderId: 'order-uuid-1',
          subtotal: { toNumber: () => 9000000 },
          commission: { toNumber: () => 540000 },
          order: { id: 'order-uuid-1' },
        },
      ]);
      mockPrisma.settlement.findFirst.mockResolvedValue(null);
      mockPrisma.settlement.create.mockResolvedValue(mockSettlement);
    });

    it('should create settlement successfully', async () => {
      const result = await service.createSettlement(
        'farmer-uuid-123',
        new Date('2026-04-01'),
        new Date('2026-04-30'),
      );

      expect(result.id).toBe('settlement-uuid-123');
      expect(mockPrisma.settlement.create).toHaveBeenCalled();
    });

    it('should throw if duplicate settlement exists', async () => {
      mockPrisma.settlement.findFirst.mockResolvedValue(mockSettlement);

      await expect(
        service.createSettlement(
          'farmer-uuid-123',
          new Date('2026-04-01'),
          new Date('2026-04-30'),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // processPayout
  // ============================================
  describe('processPayout()', () => {
    beforeEach(() => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        ...mockSettlement,
        farmer: { iban: 'IR062960000000100324200001', userId: 'user-uuid-123' },
      });
      mockPrisma.payout.create.mockResolvedValue({
        id: 'payout-uuid-123',
        amount: 7650000,
        status: 'SUCCESS',
      });
      mockPrisma.settlement.update.mockResolvedValue({
        ...mockSettlement,
        status: 'PAID',
      });
    });

    it('should process payout successfully', async () => {
      const result = await service.processPayout('settlement-uuid-123');

      expect(result.status).toBe('SUCCESS');
      expect(mockPrisma.settlement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PAID' }),
        }),
      );
    });

    it('should throw if settlement not found', async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue(null);

      await expect(service.processPayout('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if settlement not pending', async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        ...mockSettlement,
        status: 'PAID',
        farmer: { iban: 'IR123', userId: 'user-uuid-123' },
      });

      await expect(
        service.processPayout('settlement-uuid-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if farmer has no IBAN', async () => {
      mockPrisma.settlement.findUnique.mockResolvedValue({
        ...mockSettlement,
        farmer: { iban: null, userId: 'user-uuid-123' },
      });

      await expect(
        service.processPayout('settlement-uuid-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
