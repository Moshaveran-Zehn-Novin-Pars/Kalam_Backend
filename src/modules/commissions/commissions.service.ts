import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);
  private readonly DEFAULT_RATE = 0.06;

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Get all commission rules
  // ============================================
  async findAll() {
    return this.prisma.commissionRule.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ============================================
  // Get commission rate for product
  // ============================================
  async getRateForProduct(productId: string): Promise<number> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        farmer: { select: { commissionRate: true } },
        category: { select: { commissionRate: true } },
      },
    });

    if (!product) return this.DEFAULT_RATE;

    // Priority: farmer override > category rate > default
    if (product.farmer.commissionRate) {
      return product.farmer.commissionRate.toNumber();
    }

    return product.category.commissionRate.toNumber();
  }

  // ============================================
  // Create commission rule (Admin)
  // ============================================
  async createRule(data: {
    categoryId?: string;
    farmerId?: string;
    rate: number;
    validFrom: Date;
    validTo?: Date;
  }) {
    const rule = await this.prisma.commissionRule.create({
      data: {
        categoryId: data.categoryId,
        farmerId: data.farmerId,
        rate: data.rate,
        validFrom: data.validFrom,
        validTo: data.validTo,
        isActive: true,
      },
    });

    this.logger.log(`Commission rule created: ${rule.id}`);
    return rule;
  }

  // ============================================
  // Update commission rule (Admin)
  // ============================================
  async updateRule(
    ruleId: string,
    data: { rate?: number; isActive?: boolean; validTo?: Date },
  ) {
    const rule = await this.prisma.commissionRule.findUnique({
      where: { id: ruleId },
    });

    if (!rule) {
      throw new NotFoundException('قانون کمیسیون یافت نشد');
    }

    return this.prisma.commissionRule.update({
      where: { id: ruleId },
      data,
    });
  }

  // ============================================
  // Get commission stats (Admin)
  // ============================================
  async getStats(from: Date, to: Date) {
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        status: { in: ['COMPLETED', 'DELIVERED'] },
        deletedAt: null,
      },
      select: {
        commissionTotal: true,
        total: true,
        createdAt: true,
      },
    });

    const totalCommission = orders.reduce(
      (sum, o) => sum + o.commissionTotal.toNumber(),
      0,
    );
    const totalRevenue = orders.reduce((sum, o) => sum + o.total.toNumber(), 0);

    return {
      totalCommission,
      totalRevenue,
      orderCount: orders.length,
      avgCommissionRate: totalRevenue > 0 ? totalCommission / totalRevenue : 0,
      period: { from, to },
    };
  }
}
