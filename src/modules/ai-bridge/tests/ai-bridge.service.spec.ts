import { Test, TestingModule } from '@nestjs/testing';
import { AiBridgeService } from '../ai-bridge.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { AppConfigService } from '../../../config';

const mockPrisma = {
  priceHistory: {
    findMany: jest.fn(),
  },
  product: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  order: {
    findMany: jest.fn(),
  },
  orderItem: {
    findMany: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockConfig = {
  aiServiceUrl: undefined,
};

const mockProduct = {
  id: 'prod-uuid-123',
  name: 'سیب قرمز',
  pricePerUnit: { toNumber: () => 45000 },
  category: { name: 'میوه‌جات' },
};

describe('AiBridgeService', () => {
  let service: AiBridgeService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiBridgeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: AppConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AiBridgeService>(AiBridgeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // predictPrice
  // ============================================
  describe('predictPrice()', () => {
    beforeEach(() => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(undefined);
      mockPrisma.priceHistory.findMany.mockResolvedValue([
        {
          pricePerUnit: { toNumber: () => 43000 },
          recordedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
        {
          pricePerUnit: { toNumber: () => 44000 },
          recordedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        },
      ]);
      mockPrisma.product.findUnique.mockResolvedValue(mockProduct);
    });

    it('should return price forecast with fallback', async () => {
      const result = (await service.predictPrice({
        productId: 'prod-uuid-123',
        forecastDays: 7,
      })) as { isFallback: boolean; forecast: unknown[] };

      expect(result.isFallback).toBe(true);
      expect(result.forecast).toHaveLength(7);
    });

    it('should return cached result if available', async () => {
      const cachedData = { forecast: [], isFallback: true };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

      await service.predictPrice({
        productId: 'prod-uuid-123',
      });

      expect(mockPrisma.priceHistory.findMany).not.toHaveBeenCalled();
    });

    it('should save result to cache', async () => {
      await service.predictPrice({
        productId: 'prod-uuid-123',
        forecastDays: 7,
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('ai:price:prod-uuid-123'),
        expect.any(String),
        3600,
      );
    });

    it('should return empty forecast if no price history', async () => {
      mockPrisma.priceHistory.findMany.mockResolvedValue([]);

      const result = (await service.predictPrice({
        productId: 'prod-uuid-123',
        forecastDays: 3,
      })) as { forecast: { predictedPrice: number }[] };

      expect(result.forecast).toHaveLength(3);
      result.forecast.forEach((f) => {
        expect(f.predictedPrice).toBe(45000);
      });
    });
  });

  // ============================================
  // detectQuality
  // ============================================
  describe('detectQuality()', () => {
    it('should return fallback quality response', async () => {
      const result = (await service.detectQuality({
        imageUrl: 'https://example.com/image.jpg',
        productType: 'apple',
      })) as { isFallback: boolean; quality: string; confidence: number };

      expect(result.isFallback).toBe(true);
      expect(result.quality).toBe('A');
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  // ============================================
  // getRecommendations
  // ============================================
  describe('getRecommendations()', () => {
    beforeEach(() => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(undefined);
      mockPrisma.order.findMany.mockResolvedValue([
        {
          items: [{ productId: 'prod-1' }],
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-uuid-2',
          name: 'پرتقال',
          pricePerUnit: { toNumber: () => 38000 },
          unit: 'KG',
          qualityGrade: 'A',
          salesCount: 100,
          farmer: { businessName: 'باغ نارنج', ratingAvg: 4.5 },
          images: [],
        },
      ]);
    });

    it('should return fallback recommendations', async () => {
      const result = (await service.getRecommendations('user-uuid-123', {
        count: 5,
        context: 'homepage',
      })) as { isFallback: boolean; recommendations: unknown[] };

      expect(result.isFallback).toBe(true);
      expect(result.recommendations).toBeDefined();
    });

    it('should exclude already purchased products', async () => {
      await service.getRecommendations('user-uuid-123', { count: 10 });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['prod-1'] },
          }),
        }),
      );
    });

    it('should use cache on second call', async () => {
      const cachedData = { recommendations: [], isFallback: true };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

      await service.getRecommendations('user-uuid-123', {});

      expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // chat
  // ============================================
  describe('chat()', () => {
    beforeEach(() => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(undefined);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-uuid-123',
          name: 'سیب قرمز',
          pricePerUnit: { toNumber: () => 45000 },
          unit: 'KG',
          minOrderQty: { toNumber: () => 100 },
          farmer: { businessName: 'باغ سیب' },
        },
      ]);
    });

    it('should return keyword search results', async () => {
      const result = (await service.chat('user-uuid-123', {
        message: 'سیب قرمز می‌خوام',
      })) as {
        isFallback: boolean;
        reply: string;
        suggestedProducts: unknown[];
      };

      expect(result.isFallback).toBe(true);
      expect(result.reply).toBeDefined();
      expect(result.sessionId).toBeDefined();
    });

    it('should return no results message if nothing found', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      const result = (await service.chat('user-uuid-123', {
        message: 'محصول ناشناخته',
      })) as { reply: string };

      expect(result.reply).toContain('پیدا نکردم');
    });
  });

  // ============================================
  // forecastDemand
  // ============================================
  describe('forecastDemand()', () => {
    beforeEach(() => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(undefined);
      mockPrisma.orderItem.findMany.mockResolvedValue([
        {
          productId: 'prod-uuid-123',
          quantity: { toNumber: () => 200 },
          product: { name: 'سیب قرمز', unit: 'KG' },
          order: { createdAt: new Date() },
        },
        {
          productId: 'prod-uuid-123',
          quantity: { toNumber: () => 300 },
          product: { name: 'سیب قرمز', unit: 'KG' },
          order: { createdAt: new Date() },
        },
      ]);
    });

    it('should return demand forecast', async () => {
      const result = (await service.forecastDemand('farmer-uuid-123')) as {
        demandByProduct: {
          productId: string;
          totalQty: number;
          avgQtyPerOrder: number;
        }[];
      };

      expect(result.demandByProduct).toHaveLength(1);
      expect(result.demandByProduct[0].totalQty).toBe(500);
      expect(result.demandByProduct[0].avgQtyPerOrder).toBe(250);
    });

    it('should use cache on second call', async () => {
      const cachedData = { demandByProduct: [] };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

      await service.forecastDemand('farmer-uuid-123');

      expect(mockPrisma.orderItem.findMany).not.toHaveBeenCalled();
    });
  });
});
