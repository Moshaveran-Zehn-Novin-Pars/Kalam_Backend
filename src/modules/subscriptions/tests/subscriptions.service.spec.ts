import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import {
  SubscriptionsService,
  SubscriptionStatus,
} from '../subscriptions.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { SubscriptionFrequency } from '../dto';

const mockPrisma = {
  product: { findFirst: jest.fn() },
  address: { findFirst: jest.fn() },
  ledgerEntry: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockProduct = {
  id: 'prod-uuid-123',
  name: 'سیب قرمز',
  unit: 'KG',
  minOrderQty: { toNumber: () => 100 },
  status: 'ACTIVE',
  deletedAt: null,
};

const mockAddress = {
  id: 'addr-uuid-123',
  userId: 'user-uuid-123',
  deletedAt: null,
};

const mockSubscriptionData = {
  id: 'sub_123',
  userId: 'user-uuid-123',
  productId: 'prod-uuid-123',
  addressId: 'addr-uuid-123',
  quantity: 200,
  frequency: SubscriptionFrequency.WEEKLY,
  startDate: '2026-05-01',
  endDate: null,
  notes: null,
  status: SubscriptionStatus.ACTIVE,
  nextOrderDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  orderCount: 0,
  createdAt: new Date().toISOString(),
};

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // createSubscription
  // ============================================
  describe('createSubscription()', () => {
    beforeEach(() => {
      mockPrisma.product.findFirst.mockResolvedValue(mockProduct);
      mockPrisma.address.findFirst.mockResolvedValue(mockAddress);
      mockPrisma.ledgerEntry.create.mockResolvedValue({});
    });

    it('should create subscription successfully', async () => {
      const result = await service.createSubscription('user-uuid-123', {
        productId: 'prod-uuid-123',
        addressId: 'addr-uuid-123',
        quantity: 200,
        frequency: SubscriptionFrequency.WEEKLY,
        startDate: '2026-05-01',
      });

      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(result.frequency).toBe(SubscriptionFrequency.WEEKLY);
      expect(mockPrisma.ledgerEntry.create).toHaveBeenCalled();
    });

    it('should throw if product not found', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.createSubscription('user-uuid-123', {
          productId: 'non-existent',
          addressId: 'addr-uuid-123',
          quantity: 200,
          frequency: SubscriptionFrequency.WEEKLY,
          startDate: '2026-05-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if quantity below MOQ', async () => {
      await expect(
        service.createSubscription('user-uuid-123', {
          productId: 'prod-uuid-123',
          addressId: 'addr-uuid-123',
          quantity: 50,
          frequency: SubscriptionFrequency.WEEKLY,
          startDate: '2026-05-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if address not found', async () => {
      mockPrisma.address.findFirst.mockResolvedValue(null);

      await expect(
        service.createSubscription('user-uuid-123', {
          productId: 'prod-uuid-123',
          addressId: 'non-existent',
          quantity: 200,
          frequency: SubscriptionFrequency.WEEKLY,
          startDate: '2026-05-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // pauseSubscription
  // ============================================
  describe('pauseSubscription()', () => {
    beforeEach(() => {
      mockPrisma.ledgerEntry.findFirst.mockResolvedValue({
        description: JSON.stringify(mockSubscriptionData),
      });
      mockPrisma.ledgerEntry.updateMany.mockResolvedValue({});
    });

    it('should pause subscription successfully', async () => {
      const result = await service.pauseSubscription(
        'user-uuid-123',
        'sub_123',
      );

      expect(result.status).toBe(SubscriptionStatus.PAUSED);
    });

    it('should throw if subscription not found', async () => {
      mockPrisma.ledgerEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.pauseSubscription('user-uuid-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if already paused', async () => {
      mockPrisma.ledgerEntry.findFirst.mockResolvedValue({
        description: JSON.stringify({
          ...mockSubscriptionData,
          status: SubscriptionStatus.PAUSED,
        }),
      });

      await expect(
        service.pauseSubscription('user-uuid-123', 'sub_123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // cancelSubscription
  // ============================================
  describe('cancelSubscription()', () => {
    it('should cancel subscription successfully', async () => {
      mockPrisma.ledgerEntry.findFirst.mockResolvedValue({
        description: JSON.stringify(mockSubscriptionData),
      });
      mockPrisma.ledgerEntry.updateMany.mockResolvedValue({});

      const result = await service.cancelSubscription(
        'user-uuid-123',
        'sub_123',
      );

      expect(result.message).toBe('اشتراک با موفقیت لغو شد');
    });

    it('should throw if subscription not found', async () => {
      mockPrisma.ledgerEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelSubscription('user-uuid-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // getMySubscriptions
  // ============================================
  describe('getMySubscriptions()', () => {
    it('should return user subscriptions', async () => {
      mockPrisma.ledgerEntry.findMany.mockResolvedValue([
        { description: JSON.stringify(mockSubscriptionData) },
        {
          description: JSON.stringify({
            ...mockSubscriptionData,
            userId: 'other-user',
          }),
        },
      ]);

      const result = await service.getMySubscriptions('user-uuid-123');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-uuid-123');
    });
  });
});
