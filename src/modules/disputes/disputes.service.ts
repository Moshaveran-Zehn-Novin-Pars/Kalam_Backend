import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateDisputeDto, ResolveDisputeDto } from './dto';
import { DisputeStatus, OrderStatus, UserRole } from '@prisma/client';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Create dispute
  // ============================================
  async createDispute(userId: string, dto: CreateDisputeDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }

    // Only buyer can open dispute
    if (order.buyerId !== userId) {
      throw new ForbiddenException('فقط خریدار می‌تواند اعتراض ثبت کند');
    }

    const disputeableStatuses: OrderStatus[] = [
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
    ];

    if (!disputeableStatuses.includes(order.status)) {
      throw new BadRequestException(
        'فقط سفارشات تحویل داده شده قابل اعتراض هستند',
      );
    }

    // Check existing open dispute
    const existing = await this.prisma.dispute.findFirst({
      where: {
        orderId: dto.orderId,
        status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] },
      },
    });

    if (existing) {
      throw new BadRequestException('این سفارش قبلاً دارای اعتراض باز است');
    }

    const dispute = await this.prisma.dispute.create({
      data: {
        orderId: dto.orderId,
        openedById: userId,
        reason: dto.reason,
        description: dto.description,
        status: DisputeStatus.OPEN,
      },
    });

    // Update order status
    await this.prisma.order.update({
      where: { id: dto.orderId },
      data: { status: OrderStatus.DISPUTED },
    });

    this.logger.log(`Dispute created: ${dispute.id}`);
    return dispute;
  }

  // ============================================
  // Get my disputes
  // ============================================
  async getMyDisputes(userId: string) {
    return this.prisma.dispute.findMany({
      where: { openedById: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            orderNumber: true,
            total: true,
            status: true,
          },
        },
      },
    });
  }

  // ============================================
  // Get dispute by ID
  // ============================================
  async findById(disputeId: string, userId: string, userRole: UserRole) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        order: {
          select: {
            orderNumber: true,
            total: true,
            buyerId: true,
          },
        },
        openedBy: {
          select: { firstName: true, lastName: true, phone: true },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException('اعتراض یافت نشد');
    }

    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.SUPPORT &&
      dispute.openedById !== userId
    ) {
      throw new ForbiddenException('دسترسی غیرمجاز');
    }

    return dispute;
  }

  // ============================================
  // Get all disputes (Admin/Support)
  // ============================================
  async findAll(status?: DisputeStatus) {
    return this.prisma.dispute.findMany({
      where: { ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: { orderNumber: true, total: true },
        },
        openedBy: {
          select: { firstName: true, lastName: true, phone: true },
        },
      },
    });
  }

  // ============================================
  // Update dispute status (Admin)
  // ============================================
  async updateStatus(disputeId: string, status: DisputeStatus) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new NotFoundException('اعتراض یافت نشد');
    }

    return this.prisma.dispute.update({
      where: { id: disputeId },
      data: { status },
    });
  }

  // ============================================
  // Resolve dispute (Admin)
  // ============================================
  async resolveDispute(
    disputeId: string,
    adminId: string,
    dto: ResolveDisputeDto,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: true },
    });

    if (!dispute) {
      throw new NotFoundException('اعتراض یافت نشد');
    }

    if (
      dispute.status === DisputeStatus.RESOLVED ||
      dispute.status === DisputeStatus.CLOSED
    ) {
      throw new BadRequestException('این اعتراض قبلاً بسته شده است');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: DisputeStatus.RESOLVED,
          resolution: dto.resolution,
          resolvedAt: new Date(),
        },
      });

      // Update order status back to COMPLETED
      await tx.order.update({
        where: { id: dispute.orderId },
        data: { status: OrderStatus.COMPLETED },
      });
    });

    this.logger.log(`Dispute resolved: ${disputeId} by admin: ${adminId}`);
    return { message: 'اعتراض با موفقیت حل شد' };
  }
}
