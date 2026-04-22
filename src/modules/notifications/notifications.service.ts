import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateNotificationDto, QueryNotificationsDto } from './dto';

export enum NotificationType {
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_CONFIRMED = 'ORDER_CONFIRMED',
  ORDER_SHIPPED = 'ORDER_SHIPPED',
  ORDER_DELIVERED = 'ORDER_DELIVERED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  DELIVERY_ASSIGNED = 'DELIVERY_ASSIGNED',
  REVIEW_RECEIVED = 'REVIEW_RECEIVED',
  DISPUTE_OPENED = 'DISPUTE_OPENED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
  WALLET_DEPOSIT = 'WALLET_DEPOSIT',
  PAYOUT_SENT = 'PAYOUT_SENT',
  SYSTEM = 'SYSTEM',
}

export enum NotificationChannel {
  IN_APP = 'IN_APP',
  SMS = 'SMS',
  EMAIL = 'EMAIL',
  PUSH = 'PUSH',
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Get my notifications
  // ============================================
  async getMyNotifications(userId: string, query: QueryNotificationsDto) {
    const { page = 1, pageSize = 10, unreadOnly = false } = query;
    const skip = (page - 1) * pageSize;

    const where = {
      userId,
      ...(unreadOnly === true && { readAt: { equals: null } }),
    };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        unreadCount,
      },
    };
  }

  // ============================================
  // Mark as read
  // ============================================
  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('اعلان یافت نشد');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  // ============================================
  // Mark all as read
  // ============================================
  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { message: 'همه اعلان‌ها خوانده شدند' };
  }

  // ============================================
  // Create notification (internal use)
  // ============================================
  async createNotification(dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        data: (dto.data ?? {}) as object,
        channel: dto.channel ?? NotificationChannel.IN_APP,
      },
    });

    this.logger.log(`Notification sent: ${dto.type} to user: ${dto.userId}`);

    return notification;
  }

  // ============================================
  // Send bulk notifications (Admin)
  // ============================================
  async sendBulkNotification(
    userIds: string[],
    type: string,
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ) {
    const notifications = await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type,
        title,
        message,
        data: (data ?? {}) as object,
        channel: NotificationChannel.IN_APP,
      })),
    });

    this.logger.log(
      `Bulk notification sent: ${type} to ${userIds.length} users`,
    );

    return { sent: notifications.count };
  }

  // ============================================
  // Notification helpers (for other services)
  // ============================================
  async notifyOrderCreated(
    buyerId: string,
    orderNumber: string,
    orderId: string,
  ) {
    return this.createNotification({
      userId: buyerId,
      type: NotificationType.ORDER_CREATED,
      title: 'سفارش ثبت شد',
      message: `سفارش ${orderNumber} با موفقیت ثبت شد`,
      data: { orderId },
    });
  }

  async notifyOrderConfirmed(
    buyerId: string,
    orderNumber: string,
    orderId: string,
  ) {
    return this.createNotification({
      userId: buyerId,
      type: NotificationType.ORDER_CONFIRMED,
      title: 'سفارش تأیید شد',
      message: `سفارش ${orderNumber} توسط باغدار تأیید شد`,
      data: { orderId },
    });
  }

  async notifyPaymentSuccess(buyerId: string, amount: number, orderId: string) {
    return this.createNotification({
      userId: buyerId,
      type: NotificationType.PAYMENT_SUCCESS,
      title: 'پرداخت موفق',
      message: `پرداخت مبلغ ${amount.toLocaleString()} ریال با موفقیت انجام شد`,
      data: { orderId, amount },
    });
  }

  async notifyDeliveryAssigned(
    buyerId: string,
    orderNumber: string,
    orderId: string,
  ) {
    return this.createNotification({
      userId: buyerId,
      type: NotificationType.DELIVERY_ASSIGNED,
      title: 'راننده تخصیص داده شد',
      message: `برای سفارش ${orderNumber} راننده تخصیص داده شد`,
      data: { orderId },
    });
  }

  async notifyOrderDelivered(
    buyerId: string,
    orderNumber: string,
    orderId: string,
  ) {
    return this.createNotification({
      userId: buyerId,
      type: NotificationType.ORDER_DELIVERED,
      title: 'سفارش تحویل داده شد',
      message: `سفارش ${orderNumber} تحویل داده شد`,
      data: { orderId },
    });
  }

  async notifyPayoutSent(farmerId: string, amount: number, orderId: string) {
    return this.createNotification({
      userId: farmerId,
      type: NotificationType.PAYOUT_SENT,
      title: 'پرداخت ارسال شد',
      message: `مبلغ ${amount.toLocaleString()} ریال به حساب شما واریز شد`,
      data: { orderId, amount },
    });
  }

  async notifyDisputeOpened(
    farmerId: string,
    orderNumber: string,
    disputeId: string,
  ) {
    return this.createNotification({
      userId: farmerId,
      type: NotificationType.DISPUTE_OPENED,
      title: 'اعتراض ثبت شد',
      message: `برای سفارش ${orderNumber} اعتراض ثبت شده است`,
      data: { disputeId },
    });
  }

  async notifyDisputeResolved(
    buyerId: string,
    resolution: string,
    disputeId: string,
  ) {
    return this.createNotification({
      userId: buyerId,
      type: NotificationType.DISPUTE_RESOLVED,
      title: 'اعتراض حل شد',
      message: `اعتراض شما بررسی و حل شد: ${resolution}`,
      data: { disputeId },
    });
  }

  // ============================================
  // Get unread count
  // ============================================
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });

    return { unreadCount: count };
  }

  // ============================================
  // Delete old notifications (cleanup)
  // ============================================
  async deleteOldNotifications(daysOld: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.prisma.notification.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        readAt: { not: null },
      },
    });

    this.logger.log(`Deleted ${result.count} old notifications`);
    return { deleted: result.count };
  }
}
