import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AppConfigService } from '../../config';
import {
  PricePredictionDto,
  QualityDetectionDto,
  RecommendationDto,
  ChatDto,
} from './dto';

@Injectable()
export class AiBridgeService {
  private readonly logger = new Logger(AiBridgeService.name);
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  // ============================================
  // Price Prediction
  // ============================================
  async predictPrice(dto: PricePredictionDto) {
    const cacheKey = `ai:price:${dto.productId}:${dto.forecastDays}`;

    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug(`Price prediction from cache: ${dto.productId}`);
      return JSON.parse(cached) as object;
    }

    // Get price history from DB
    const priceHistory = await this.prisma.priceHistory.findMany({
      where: { productId: dto.productId },
      orderBy: { recordedAt: 'desc' },
      take: dto.historicalDays ?? 30,
    });

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: {
        name: true,
        pricePerUnit: true,
        category: { select: { name: true } },
      },
    });

    if (!product) {
      throw new ServiceUnavailableException('محصول یافت نشد');
    }

    // Try AI service if available
    if (this.config.aiServiceUrl) {
      try {
        const response = await fetch(
          `${this.config.aiServiceUrl}/ai/price-prediction`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: dto.productId,
              historicalDays: dto.historicalDays,
              forecastDays: dto.forecastDays,
              priceHistory: priceHistory.map((p) => ({
                price: p.pricePerUnit.toNumber(),
                date: p.recordedAt,
              })),
            }),
            signal: AbortSignal.timeout(5000),
          },
        );

        if (response.ok) {
          const data = (await response.json()) as object;
          await this.redis.set(cacheKey, JSON.stringify(data), this.CACHE_TTL);
          return data;
        }
      } catch (error) {
        this.logger.warn(
          `AI service unavailable, using fallback : ${error.message}`,
        );
      }
    }

    // Fallback: simple moving average
    const result = this.simplePriceForecast(
      product,
      priceHistory,
      dto.forecastDays ?? 7,
    );

    await this.redis.set(cacheKey, JSON.stringify(result), this.CACHE_TTL);
    return result;
  }

  // ============================================
  // Quality Detection
  // ============================================
  async detectQuality(dto: QualityDetectionDto) {
    // Try AI service if available
    if (this.config.aiServiceUrl) {
      try {
        const response = await fetch(
          `${this.config.aiServiceUrl}/ai/quality-detection`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dto),
            signal: AbortSignal.timeout(10000),
          },
        );

        if (response.ok) {
          return response.json() as Promise<object>;
        }
      } catch (error) {
        this.logger.warn(
          'AI service unavailable for quality detection :  ' + error.message,
        );
      }
    }

    // Fallback: mock response
    return {
      quality: 'A',
      confidence: 0.85,
      details: {
        color: 'good',
        size: 'uniform',
        defects: 'none detected',
      },
      isFallback: true,
    };
  }

  // ============================================
  // Product Recommendations
  // ============================================
  async getRecommendations(userId: string, dto: RecommendationDto) {
    const cacheKey = `ai:recommendations:${userId}:${dto.context}`;

    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as object;
    }

    // Get user's order history
    const userOrders = await this.prisma.order.findMany({
      where: { buyerId: userId, deletedAt: null },
      include: {
        items: {
          select: { productId: true, farmerId: true },
        },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    const purchasedProductIds = userOrders.flatMap((o) =>
      o.items.map((i) => i.productId),
    );

    // Try AI service
    if (this.config.aiServiceUrl) {
      try {
        const response = await fetch(
          `${this.config.aiServiceUrl}/ai/recommendations`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              purchasedProductIds,
              count: dto.count,
              context: dto.context,
            }),
            signal: AbortSignal.timeout(5000),
          },
        );

        if (response.ok) {
          const data = (await response.json()) as object;
          await this.redis.set(cacheKey, JSON.stringify(data), 300);
          return data;
        }
      } catch {
        this.logger.warn('AI service unavailable for recommendations');
      }
    }

    // Fallback: popular products
    const products = await this.prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        id: { notIn: purchasedProductIds },
      },
      orderBy: { salesCount: 'desc' },
      take: dto.count ?? 10,
      select: {
        id: true,
        name: true,
        slug: true,
        pricePerUnit: true,
        unit: true,
        qualityGrade: true,
        salesCount: true,
        farmer: { select: { businessName: true, ratingAvg: true } },
        images: {
          where: { isPrimary: true },
          select: { url: true },
          take: 1,
        },
      },
    });

    const result = {
      recommendations: products,
      context: dto.context,
      isFallback: true,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 300);
    return result;
  }

  // ============================================
  // Prompt-to-Cart Chat
  // ============================================
  async chat(userId: string, dto: ChatDto) {
    const sessionId = dto.sessionId ?? `session:${userId}:${Date.now()}`;

    // Get session history
    const historyKey = `ai:chat:${sessionId}`;
    const historyRaw = await this.redis.get(historyKey);
    const history = historyRaw ? (JSON.parse(historyRaw) as unknown[]) : [];

    // Try AI service
    if (this.config.aiServiceUrl) {
      try {
        const response = await fetch(`${this.config.aiServiceUrl}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            message: dto.message,
            userId,
            history,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
          const data = (await response.json()) as {
            reply: string;
            suggestedProducts?: unknown[];
          };

          // Save to history
          const newHistory = [
            ...history,
            { role: 'user', content: dto.message },
            { role: 'assistant', content: data.reply },
          ];
          await this.redis.set(historyKey, JSON.stringify(newHistory), 3600);

          return { ...data, sessionId };
        }
      } catch {
        this.logger.warn('AI chat service unavailable');
      }
    }

    // Fallback: keyword-based product search
    return this.keywordSearch(dto.message, sessionId);
  }

  // ============================================
  // Demand Forecast (for farmers)
  // ============================================
  async forecastDemand(farmerId: string) {
    const cacheKey = `ai:demand:${farmerId}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as object;
    }

    const recentOrders = await this.prisma.orderItem.findMany({
      where: {
        farmerId,
        order: {
          status: { in: ['COMPLETED', 'DELIVERED'] },
          deletedAt: null,
        },
      },
      include: {
        product: { select: { name: true, unit: true } },
        order: { select: { createdAt: true } },
      },
      orderBy: { order: { createdAt: 'desc' } },
      take: 100,
    });

    // Simple demand analysis
    const productDemand = new Map<
      string,
      {
        name: string;
        unit: string;
        totalQty: number;
        orderCount: number;
      }
    >();

    for (const item of recentOrders) {
      const key = item.productId;
      const existing = productDemand.get(key);
      if (existing) {
        existing.totalQty += item.quantity.toNumber();
        existing.orderCount += 1;
      } else {
        productDemand.set(key, {
          name: item.product.name,
          unit: item.product.unit,
          totalQty: item.quantity.toNumber(),
          orderCount: 1,
        });
      }
    }

    const result = {
      farmerId,
      period: 'last_100_orders',
      demandByProduct: Array.from(productDemand.entries()).map(
        ([productId, data]) => ({
          productId,
          ...data,
          avgQtyPerOrder: data.totalQty / data.orderCount,
        }),
      ),
      isFallback: !this.config.aiServiceUrl,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), this.CACHE_TTL);
    return result;
  }

  // ============================================
  // Private Helpers
  // ============================================
  private simplePriceForecast(
    product: { name: string; pricePerUnit: { toNumber: () => number } },
    history: { pricePerUnit: { toNumber: () => number }; recordedAt: Date }[],
    forecastDays: number,
  ) {
    const prices = history.map((h) => h.pricePerUnit.toNumber());
    const currentPrice = product.pricePerUnit.toNumber();

    if (prices.length === 0) {
      return {
        productName: product.name,
        currentPrice,
        forecast: Array.from({ length: forecastDays }, (_, i) => ({
          day: i + 1,
          predictedPrice: currentPrice,
          confidence: 0.5,
        })),
        isFallback: true,
      };
    }

    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const trend =
      prices.length > 1
        ? (prices[0] - prices[prices.length - 1]) / prices.length
        : 0;

    return {
      productName: product.name,
      currentPrice,
      avgHistoricalPrice: avgPrice,
      forecast: Array.from({ length: forecastDays }, (_, i) => ({
        day: i + 1,
        predictedPrice: Math.round(currentPrice + trend * (i + 1)),
        confidence: Math.max(0.5, 0.9 - i * 0.05),
      })),
      isFallback: true,
    };
  }

  private async keywordSearch(message: string, sessionId: string) {
    const keywords = message.split(' ').filter((w) => w.length > 1);

    const products = await this.prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        OR: keywords.map((k) => ({
          name: { contains: k },
        })),
      },
      take: 5,
      select: {
        id: true,
        name: true,
        pricePerUnit: true,
        unit: true,
        minOrderQty: true,
        farmer: { select: { businessName: true } },
      },
    });

    return {
      reply:
        products.length > 0
          ? `${products.length} محصول پیدا کردم که ممکنه مناسب باشه:`
          : 'متأسفانه محصول مناسبی پیدا نکردم. لطفاً جستجوی دیگری امتحان کنید.',
      suggestedProducts: products,
      sessionId,
      isFallback: true,
    };
  }
}
