import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Calculate settlement for farmer
  // ============================================
  async calculateForFarmer(
    farmerId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const farmer = await this.prisma.farmer.findFirst({
      where: { id: farmerId, deletedAt: null },
    });

    if (!farmer) {
      throw new NotFoundException('باغدار یافت نشد');
    }

    // Get completed orders with farmer items
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        farmerId,
        order: {
          status: OrderStatus.COMPLETED,
          createdAt: { gte: periodStart, lte: periodEnd },
          deletedAt: null,
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            deliveryFee: true,
            tax: true,
          },
        },
      },
    });

    const grossAmount = orderItems.reduce(
      (sum, item) => sum + item.subtotal.toNumber(),
      0,
    );

    const commissionAmount = orderItems.reduce(
      (sum, item) => sum + item.commission.toNumber(),
      0,
    );

    const taxes = grossAmount * 0.09;
    const netAmount = grossAmount - commissionAmount - taxes;

    return {
      farmerId,
      periodStart,
      periodEnd,
      grossAmount,
      commissionAmount,
      taxes,
      netAmount,
      orderCount: new Set(orderItems.map((i) => i.orderId)).size,
      itemCount: orderItems.length,
      orders: orderItems,
    };
  }

  // ============================================
  // Create settlement
  // ============================================
  async createSettlement(farmerId: string, periodStart: Date, periodEnd: Date) {
    const calc = await this.calculateForFarmer(
      farmerId,
      periodStart,
      periodEnd,
    );

    if (calc.netAmount <= 0) {
      throw new BadRequestException('مبلغ قابل تسویه صفر یا منفی است');
    }

    // Check no duplicate settlement
    const existing = await this.prisma.settlement.findFirst({
      where: {
        farmerId,
        periodStart,
        periodEnd,
        status: { in: ['PENDING', 'PAID'] },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'تسویه‌ای برای این دوره قبلاً ایجاد شده است',
      );
    }

    const settlement = await this.prisma.settlement.create({
      data: {
        farmerId,
        periodStart,
        periodEnd,
        grossAmount: calc.grossAmount,
        commissionAmount: calc.commissionAmount,
        taxes: calc.taxes,
        netAmount: calc.netAmount,
        status: 'PENDING',
      },
    });

    this.logger.log(
      `Settlement created: ${settlement.id} for farmer: ${farmerId}`,
    );
    return settlement;
  }

  // ============================================
  // Get settlements for farmer
  // ============================================
  async getFarmerSettlements(farmerId: string) {
    return this.prisma.settlement.findMany({
      where: { farmerId },
      orderBy: { createdAt: 'desc' },
      include: {
        payouts: true,
      },
    });
  }

  // ============================================
  // Get all settlements (Admin)
  // ============================================
  async findAll(status?: string) {
    return this.prisma.settlement.findMany({
      where: { ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
      include: {
        farmer: {
          select: {
            businessName: true,
            iban: true,
            user: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
        payouts: true,
      },
    });
  }

  // ============================================
  // Process payout (Admin)
  // ============================================
  async processPayout(settlementId: string) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      include: {
        farmer: { select: { iban: true, userId: true } },
      },
    });

    if (!settlement) {
      throw new NotFoundException('تسویه یافت نشد');
    }

    if (settlement.status !== 'PENDING') {
      throw new BadRequestException('این تسویه قابل پرداخت نیست');
    }

    if (!settlement.farmer.iban) {
      throw new BadRequestException('باغدار شماره شبا ندارد');
    }

    const payout = await this.prisma.$transaction(async (tx) => {
      const newPayout = await tx.payout.create({
        data: {
          farmerId: settlement.farmerId,
          settlementId: settlement.id,
          amount: settlement.netAmount,
          iban: settlement.farmer.iban!,
          status: 'SUCCESS',
          paidAt: new Date(),
          referenceId: `PAY-${Date.now()}`,
        },
      });

      await tx.settlement.update({
        where: { id: settlementId },
        data: { status: 'PAID', paidAt: new Date() },
      });

      return newPayout;
    });

    this.logger.log(
      `Payout processed: ${payout.id} for settlement: ${settlementId}`,
    );
    return payout;
  }
}
