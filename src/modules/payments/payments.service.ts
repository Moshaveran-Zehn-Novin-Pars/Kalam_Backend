import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  InitiatePaymentDto,
  WalletDepositDto,
  QueryTransactionsDto,
} from './dto';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  TransactionType,
} from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Get wallet
  // ============================================
  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { userId, currency: 'IRR' },
      });
    }

    return wallet;
  }

  // ============================================
  // Get wallet transactions
  // ============================================
  async getTransactions(userId: string, query: QueryTransactionsDto) {
    const { page = 1, pageSize = 10 } = query;
    const skip = (page - 1) * pageSize;

    const wallet = await this.getWallet(userId);

    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.count({
        where: { walletId: wallet.id },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ============================================
  // Deposit to wallet (simulate payment gateway)
  // ============================================
  async depositToWallet(userId: string, dto: WalletDepositDto) {
    const wallet = await this.getWallet(userId);

    const updatedWallet = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: dto.amount } },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.DEPOSIT,
          amount: dto.amount,
          balanceAfter: updated.balance.toNumber(),
          description: 'شارژ کیف پول',
        },
      });

      return updated;
    });

    this.logger.log(`Wallet deposit: ${dto.amount} for user: ${userId}`);
    return updatedWallet;
  }

  // ============================================
  // Initiate payment for order
  // ============================================
  async initiatePayment(userId: string, dto: InitiatePaymentDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, buyerId: userId, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('این سفارش در انتظار پرداخت نیست');
    }

    // Check existing payment
    const existingPayment = await this.prisma.payment.findUnique({
      where: { orderId: dto.orderId },
    });

    if (existingPayment?.status === PaymentStatus.SUCCESS) {
      throw new BadRequestException('این سفارش قبلاً پرداخت شده است');
    }

    if (dto.method === PaymentMethod.WALLET) {
      return this.payWithWallet(userId, order.id, order.total.toNumber());
    }

    // Simulate online gateway
    return this.simulateGatewayPayment(userId, order, dto.gateway);
  }

  // ============================================
  // Pay with wallet
  // ============================================
  private async payWithWallet(userId: string, orderId: string, amount: number) {
    const wallet = await this.getWallet(userId);

    if (wallet.balance.toNumber() < amount) {
      throw new BadRequestException(
        `موجودی کافی نیست. موجودی: ${wallet.balance.toNumber().toLocaleString()} ریال`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Deduct from wallet
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: amount },
          heldBalance: { increment: amount },
        },
      });

      // Record transaction
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.PURCHASE,
          amount,
          balanceAfter: updatedWallet.balance.toNumber(),
          reference: orderId,
          description: 'پرداخت سفارش',
        },
      });

      // Create/update payment record
      await tx.payment.upsert({
        where: { orderId },
        create: {
          orderId,
          method: PaymentMethod.WALLET,
          amount,
          status: PaymentStatus.SUCCESS,
          paidAt: new Date(),
        },
        update: {
          status: PaymentStatus.SUCCESS,
          paidAt: new Date(),
        },
      });

      // Update order status
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAID_HELD },
      });

      // Add status history
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: OrderStatus.PAID_HELD,
          changedBy: userId,
          reason: 'پرداخت از کیف پول',
        },
      });

      // Create escrow
      await tx.escrow.upsert({
        where: { orderId },
        create: {
          orderId,
          amount,
          status: 'HELD',
        },
        update: {
          amount,
          status: 'HELD',
          heldAt: new Date(),
        },
      });
    });

    this.logger.log(`Wallet payment successful for order: ${orderId}`);

    return {
      success: true,
      method: PaymentMethod.WALLET,
      message: 'پرداخت با موفقیت انجام شد',
      orderId,
    };
  }

  // ============================================
  // Simulate gateway payment (dev/test)
  // ============================================
  private async simulateGatewayPayment(
    userId: string,
    order: { id: string; total: { toNumber: () => number } },
    gateway?: string,
  ) {
    const amount = order.total.toNumber();
    const gatewayRef = `SIM-${Date.now()}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          method: PaymentMethod.ONLINE_GATEWAY,
          amount,
          status: PaymentStatus.SUCCESS,
          gateway: gateway ?? 'ZARINPAL',
          gatewayRef,
          paidAt: new Date(),
        },
        update: {
          status: PaymentStatus.SUCCESS,
          gateway: gateway ?? 'ZARINPAL',
          gatewayRef,
          paidAt: new Date(),
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAID_HELD },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: OrderStatus.PAID_HELD,
          changedBy: userId,
          reason: `پرداخت آنلاین - ${gateway ?? 'ZARINPAL'}`,
        },
      });

      await tx.escrow.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          amount,
          status: 'HELD',
        },
        update: {
          amount,
          status: 'HELD',
          heldAt: new Date(),
        },
      });
    });

    this.logger.log(
      `Gateway payment simulated for order: ${order.id} ref: ${gatewayRef}`,
    );

    return {
      success: true,
      method: PaymentMethod.ONLINE_GATEWAY,
      message: 'پرداخت با موفقیت انجام شد',
      orderId: order.id,
      gatewayRef,
    };
  }

  // ============================================
  // Release escrow (after delivery confirmation)
  // ============================================
  async releaseEscrow(orderId: string, adminId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        items: true,
        escrow: true,
      },
    });

    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'فقط سفارشات تحویل داده شده قابل تسویه هستند',
      );
    }

    if (!order.escrow || order.escrow.status === 'RELEASED') {
      throw new BadRequestException('این سفارش قبلاً تسویه شده است');
    }

    await this.prisma.$transaction(async (tx) => {
      // Release escrow
      await tx.escrow.update({
        where: { orderId },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });

      // Update order status to COMPLETE
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.COMPLETED },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: OrderStatus.COMPLETED,
          changedBy: adminId,
          reason: 'تسویه escrow و تکمیل سفارش',
        },
      });

      // Pay farmers
      const farmerAmounts = new Map<string, number>();
      for (const item of order.items) {
        const current = farmerAmounts.get(item.farmerId) ?? 0;
        const farmerShare =
          item.subtotal.toNumber() - item.commission.toNumber();
        farmerAmounts.set(item.farmerId, current + farmerShare);
      }

      for (const [farmerId, amount] of farmerAmounts) {
        const farmer = await tx.farmer.findUnique({
          where: { id: farmerId },
          select: { userId: true, totalSales: true },
        });

        if (!farmer) continue;

        const wallet = await tx.wallet.findUnique({
          where: { userId: farmer.userId },
        });

        if (!wallet) continue;

        const updated = await tx.wallet.update({
          where: { userId: farmer.userId },
          data: { balance: { increment: amount } },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: TransactionType.PAYOUT,
            amount,
            balanceAfter: updated.balance.toNumber(),
            reference: orderId,
            description: 'پرداخت سهم باغدار',
          },
        });

        // Update farmer total sales
        await tx.farmer.update({
          where: { id: farmerId },
          data: { totalSales: { increment: amount } },
        });
      }
    });

    this.logger.log(`Escrow released for order: ${orderId}`);
    return { message: 'تسویه با موفقیت انجام شد' };
  }

  // ============================================
  // Get payment by order
  // ============================================
  async getPaymentByOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, buyerId: userId, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }

    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      throw new NotFoundException('پرداختی برای این سفارش یافت نشد');
    }

    return payment;
  }

  // ============================================
  // Refund payment
  // ============================================
  async refundPayment(orderId: string, adminId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { payment: true },
    });

    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }

    if (order.status !== OrderStatus.CANCELLED) {
      throw new BadRequestException('فقط سفارشات لغو شده قابل استرداد هستند');
    }

    if (!order.payment || order.payment.status !== PaymentStatus.SUCCESS) {
      throw new BadRequestException('پرداخت موفقی برای این سفارش یافت نشد');
    }

    const amount = order.payment.amount.toNumber();

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { orderId },
        data: { status: PaymentStatus.REFUNDED },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.REFUNDED },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: OrderStatus.REFUNDED,
          changedBy: adminId,
          reason: 'استرداد وجه',
        },
      });

      // Return money to buyer wallet
      const buyerWallet = await tx.wallet.findUnique({
        where: { userId: order.buyerId },
      });

      if (buyerWallet) {
        const updated = await tx.wallet.update({
          where: { userId: order.buyerId },
          data: {
            balance: { increment: amount },
            heldBalance: { decrement: amount },
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: buyerWallet.id,
            type: TransactionType.REFUND,
            amount,
            balanceAfter: updated.balance.toNumber(),
            reference: orderId,
            description: 'استرداد وجه سفارش',
          },
        });
      }
    });

    this.logger.log(`Payment refunded for order: ${orderId}`);
    return { message: 'استرداد وجه با موفقیت انجام شد' };
  }
}
