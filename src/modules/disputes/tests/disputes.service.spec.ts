import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DisputesService } from '../disputes.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { DisputeStatus, OrderStatus, UserRole } from '@prisma/client';

const mockPrisma = {
  dispute: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  order: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockOrder = {
  id: 'order-uuid-123',
  buyerId: 'user-uuid-123',
  status: OrderStatus.DELIVERED,
  total: { toNumber: () => 5000000 },
  deletedAt: null,
};

const mockDispute = {
  id: 'dispute-uuid-123',
  orderId: 'order-uuid-123',
  openedById: 'user-uuid-123',
  reason: 'محصول ناقص بود',
  description: 'توضیحات...',
  status: DisputeStatus.OPEN,
  resolution: null,
  resolvedAt: null,
  evidence: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  order: {
    orderNumber: 'KLM-2026-00001',
    total: 5000000,
    buyerId: 'user-uuid-123',
  },
};

describe('DisputesService', () => {
  let service: DisputesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DisputesService>(DisputesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // createDispute
  // ============================================
  describe('createDispute()', () => {
    beforeEach(() => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockPrisma.dispute.findFirst.mockResolvedValue(null);
      mockPrisma.dispute.create.mockResolvedValue(mockDispute);
      mockPrisma.order.update.mockResolvedValue({});
    });

    it('should create dispute successfully', async () => {
      const result = await service.createDispute('user-uuid-123', {
        orderId: 'order-uuid-123',
        reason: 'محصول ناقص بود',
        description: 'توضیحات...',
      });

      expect(result.id).toBe('dispute-uuid-123');
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: OrderStatus.DISPUTED },
        }),
      );
    });

    it('should throw if order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.createDispute('user-uuid-123', {
          orderId: 'non-existent',
          reason: 'test',
          description: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if not buyer', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        buyerId: 'other-user-id',
      });

      await expect(
        service.createDispute('user-uuid-123', {
          orderId: 'order-uuid-123',
          reason: 'test',
          description: 'test',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if order not delivered', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PENDING_PAYMENT,
      });

      await expect(
        service.createDispute('user-uuid-123', {
          orderId: 'order-uuid-123',
          reason: 'test',
          description: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if open dispute exists', async () => {
      mockPrisma.dispute.findFirst.mockResolvedValue(mockDispute);

      await expect(
        service.createDispute('user-uuid-123', {
          orderId: 'order-uuid-123',
          reason: 'test',
          description: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // findById
  // ============================================
  describe('findById()', () => {
    it('should return dispute for owner', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(mockDispute);

      const result = await service.findById(
        'dispute-uuid-123',
        'user-uuid-123',
        UserRole.BUYER,
      );

      expect(result.id).toBe('dispute-uuid-123');
    });

    it('should return dispute for admin', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue({
        ...mockDispute,
        openedById: 'other-user-id',
      });

      const result = await service.findById(
        'dispute-uuid-123',
        'admin-uuid-123',
        UserRole.ADMIN,
      );

      expect(result.id).toBe('dispute-uuid-123');
    });

    it('should throw ForbiddenException for non-owner', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue({
        ...mockDispute,
        openedById: 'other-user-id',
      });

      await expect(
        service.findById('dispute-uuid-123', 'user-uuid-123', UserRole.BUYER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if not found', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(null);

      await expect(
        service.findById('non-existent', 'user-uuid-123', UserRole.ADMIN),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // resolveDispute
  // ============================================
  describe('resolveDispute()', () => {
    beforeEach(() => {
      mockPrisma.dispute.findUnique.mockResolvedValue({
        ...mockDispute,
        order: mockOrder,
      });
      mockPrisma.dispute.update.mockResolvedValue({});
      mockPrisma.order.update.mockResolvedValue({});
    });

    it('should resolve dispute successfully', async () => {
      const result = await service.resolveDispute(
        'dispute-uuid-123',
        'admin-uuid-123',
        { resolution: 'استرداد ۵۰٪ مبلغ' },
      );

      expect(result.message).toBe('اعتراض با موفقیت حل شد');
      expect(mockPrisma.dispute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DisputeStatus.RESOLVED,
            resolution: 'استرداد ۵۰٪ مبلغ',
          }),
        }),
      );
    });

    it('should throw if dispute not found', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(null);

      await expect(
        service.resolveDispute('non-existent', 'admin-uuid-123', {
          resolution: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if dispute already resolved', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue({
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
        order: mockOrder,
      });

      await expect(
        service.resolveDispute('dispute-uuid-123', 'admin-uuid-123', {
          resolution: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // updateStatus
  // ============================================
  describe('updateStatus()', () => {
    it('should update status successfully', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(mockDispute);
      mockPrisma.dispute.update.mockResolvedValue({
        ...mockDispute,
        status: DisputeStatus.UNDER_REVIEW,
      });

      const result = await service.updateStatus(
        'dispute-uuid-123',
        DisputeStatus.UNDER_REVIEW,
      );

      expect(result.status).toBe(DisputeStatus.UNDER_REVIEW);
    });

    it('should throw if dispute not found', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('non-existent', DisputeStatus.UNDER_REVIEW),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
