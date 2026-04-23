import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateSubscriptionDto, SubscriptionFrequency } from './dto';
import { ProductStatus } from '@prisma/client';

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Create subscription
  // ============================================
  async createSubscription(userId: string, dto: CreateSubscriptionDto) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: dto.productId,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      },
    });

    if (!product) {
      throw new NotFoundException('محصول یافت نشد یا غیرفعال است');
    }

    if (dto.quantity < product.minOrderQty.toNumber()) {
      throw new BadRequestException(
        `حداقل سفارش ${product.minOrderQty} ${product.unit} است`,
      );
    }

    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId, deletedAt: null },
    });

    if (!address) {
      throw new NotFoundException('آدرس یافت نشد');
    }

    const subscriptionData = {
      id: `sub_${Date.now()}`,
      userId,
      productId: dto.productId,
      addressId: dto.addressId,
      quantity: dto.quantity,
      frequency: dto.frequency,
      startDate: dto.startDate,
      endDate: dto.endDate ?? null,
      notes: dto.notes ?? null,
      status: SubscriptionStatus.ACTIVE,
      nextOrderDate: this.calculateNextDate(
        new Date(dto.startDate),
        dto.frequency,
      ),
      orderCount: 0,
      createdAt: new Date().toISOString(),
    };

    // Store in LedgerEntry
    await this.prisma.ledgerEntry.create({
      data: {
        accountId: subscriptionData.id,
        accountType: 'SUBSCRIPTION',
        debit: dto.quantity,
        credit: 0,
        reference: dto.productId,
        description: JSON.stringify(subscriptionData),
      },
    });

    this.logger.log(`Subscription created: ${subscriptionData.id}`);
    return subscriptionData;
  }

  // ============================================
  // Get my subscriptions
  // ============================================
  async getMySubscriptions(userId: string) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { accountType: 'SUBSCRIPTION' },
      orderBy: { createdAt: 'desc' },
    });

    return entries
      .map(
        (e) =>
          JSON.parse(e.description ?? '{}') as ReturnType<
            typeof this.parseSubscription
          >,
      )
      .filter((s) => s.userId === userId);
  }

  // ============================================
  // Pause subscription
  // ============================================
  async pauseSubscription(userId: string, subscriptionId: string) {
    const entry = await this.findSubscriptionEntry(subscriptionId);
    const sub = this.parseSubscription(entry.description ?? '{}');

    if (sub.userId !== userId) {
      throw new BadRequestException('دسترسی غیرمجاز');
    }

    if (sub.status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException('اشتراک فعال نیست');
    }

    sub.status = SubscriptionStatus.PAUSED;

    await this.prisma.ledgerEntry.updateMany({
      where: { accountId: subscriptionId, accountType: 'SUBSCRIPTION' },
      data: { description: JSON.stringify(sub) },
    });

    return sub;
  }

  // ============================================
  // Resume subscription
  // ============================================
  async resumeSubscription(userId: string, subscriptionId: string) {
    const entry = await this.findSubscriptionEntry(subscriptionId);
    const sub = this.parseSubscription(entry.description ?? '{}');

    if (sub.userId !== userId) {
      throw new BadRequestException('دسترسی غیرمجاز');
    }

    if (sub.status !== SubscriptionStatus.PAUSED) {
      throw new BadRequestException('اشتراک در حالت توقف نیست');
    }

    sub.status = SubscriptionStatus.ACTIVE;
    sub.nextOrderDate = this.calculateNextDate(
      new Date(),
      sub.frequency as SubscriptionFrequency,
    );

    await this.prisma.ledgerEntry.updateMany({
      where: { accountId: subscriptionId, accountType: 'SUBSCRIPTION' },
      data: { description: JSON.stringify(sub) },
    });

    return sub;
  }

  // ============================================
  // Cancel subscription
  // ============================================
  async cancelSubscription(userId: string, subscriptionId: string) {
    const entry = await this.findSubscriptionEntry(subscriptionId);
    const sub = this.parseSubscription(entry.description ?? '{}');

    if (sub.userId !== userId) {
      throw new BadRequestException('دسترسی غیرمجاز');
    }

    sub.status = SubscriptionStatus.CANCELLED;

    await this.prisma.ledgerEntry.updateMany({
      where: { accountId: subscriptionId, accountType: 'SUBSCRIPTION' },
      data: { description: JSON.stringify(sub) },
    });

    return { message: 'اشتراک با موفقیت لغو شد' };
  }

  // ============================================
  // Private helpers
  // ============================================
  private async findSubscriptionEntry(subscriptionId: string) {
    const entry = await this.prisma.ledgerEntry.findFirst({
      where: { accountId: subscriptionId, accountType: 'SUBSCRIPTION' },
    });

    if (!entry) {
      throw new NotFoundException('اشتراک یافت نشد');
    }

    return entry;
  }

  private parseSubscription(description: string) {
    return JSON.parse(description) as {
      id: string;
      userId: string;
      productId: string;
      addressId: string;
      quantity: number;
      frequency: string;
      startDate: string;
      endDate: string | null;
      notes: string | null;
      status: SubscriptionStatus;
      nextOrderDate: string;
      orderCount: number;
      createdAt: string;
    };
  }

  private calculateNextDate(
    from: Date,
    frequency: SubscriptionFrequency,
  ): string {
    const next = new Date(from);
    switch (frequency) {
      case SubscriptionFrequency.WEEKLY:
        next.setDate(next.getDate() + 7);
        break;
      case SubscriptionFrequency.BIWEEKLY:
        next.setDate(next.getDate() + 14);
        break;
      case SubscriptionFrequency.MONTHLY:
        next.setMonth(next.getMonth() + 1);
        break;
    }
    return next.toISOString();
  }
}
