import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  NotificationsService,
  NotificationType,
  NotificationChannel,
} from '../notifications.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const mockPrisma = {
  notification: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
};

const mockNotification = {
  id: 'notif-uuid-123',
  userId: 'user-uuid-123',
  type: NotificationType.ORDER_CREATED,
  title: 'سفارش ثبت شد',
  message: 'سفارش KLM-2026-00001 با موفقیت ثبت شد',
  data: { orderId: 'order-uuid-123' },
  readAt: null,
  channel: NotificationChannel.IN_APP,
  createdAt: new Date(),
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // getMyNotifications
  // ============================================
  describe('getMyNotifications()', () => {
    beforeEach(() => {
      mockPrisma.notification.findMany.mockResolvedValue([mockNotification]);
      mockPrisma.notification.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);
    });

    it('should return paginated notifications', async () => {
      const result = await service.getMyNotifications('user-uuid-123', {
        page: 1,
        pageSize: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.unreadCount).toBe(1);
    });

    it('should filter unread only', async () => {
      await service.getMyNotifications('user-uuid-123', {
        unreadOnly: true,
      });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ readAt: { equals: null } }),
        }),
      );
    });
  });

  // ============================================
  // markAsRead
  // ============================================
  describe('markAsRead()', () => {
    it('should mark notification as read', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(mockNotification);
      mockPrisma.notification.update.mockResolvedValue({
        ...mockNotification,
        readAt: new Date(),
      });

      const result = await service.markAsRead(
        'user-uuid-123',
        'notif-uuid-123',
      );

      expect(result.readAt).toBeDefined();
      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { readAt: expect.any(Date) },
        }),
      );
    });

    it('should throw if notification not found', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(
        service.markAsRead('user-uuid-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // markAllAsRead
  // ============================================
  describe('markAllAsRead()', () => {
    it('should mark all as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllAsRead('user-uuid-123');

      expect(result.message).toBe('همه اعلان‌ها خوانده شدند');
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-uuid-123', readAt: null },
          data: { readAt: expect.any(Date) },
        }),
      );
    });
  });

  // ============================================
  // createNotification
  // ============================================
  describe('createNotification()', () => {
    it('should create notification successfully', async () => {
      mockPrisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.createNotification({
        userId: 'user-uuid-123',
        type: NotificationType.ORDER_CREATED,
        title: 'سفارش ثبت شد',
        message: 'سفارش با موفقیت ثبت شد',
        data: { orderId: 'order-uuid-123' },
      });

      expect(result.type).toBe(NotificationType.ORDER_CREATED);
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });

    it('should use IN_APP channel by default', async () => {
      mockPrisma.notification.create.mockResolvedValue(mockNotification);

      await service.createNotification({
        userId: 'user-uuid-123',
        type: 'TEST',
        title: 'test',
        message: 'test',
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: NotificationChannel.IN_APP,
          }),
        }),
      );
    });
  });

  // ============================================
  // sendBulkNotification
  // ============================================
  describe('sendBulkNotification()', () => {
    it('should send bulk notifications', async () => {
      mockPrisma.notification.createMany.mockResolvedValue({ count: 3 });

      const result = await service.sendBulkNotification(
        ['user-1', 'user-2', 'user-3'],
        NotificationType.SYSTEM,
        'اطلاعیه سیستم',
        'پیام سیستمی',
      );

      expect(result.sent).toBe(3);
      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ userId: 'user-1' }),
            expect.objectContaining({ userId: 'user-2' }),
            expect.objectContaining({ userId: 'user-3' }),
          ]),
        }),
      );
    });
  });

  // ============================================
  // getUnreadCount
  // ============================================
  describe('getUnreadCount()', () => {
    it('should return unread count', async () => {
      mockPrisma.notification.count.mockResolvedValue(5);

      const result = await service.getUnreadCount('user-uuid-123');

      expect(result.unreadCount).toBe(5);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-uuid-123', readAt: null },
        }),
      );
    });
  });

  // ============================================
  // Notification helpers
  // ============================================
  describe('Notification Helpers', () => {
    beforeEach(() => {
      mockPrisma.notification.create.mockResolvedValue(mockNotification);
    });

    it('notifyOrderCreated should create ORDER_CREATED notification', async () => {
      await service.notifyOrderCreated(
        'user-uuid-123',
        'KLM-2026-00001',
        'order-uuid-123',
      );

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: NotificationType.ORDER_CREATED,
          }),
        }),
      );
    });

    it('notifyPaymentSuccess should create PAYMENT_SUCCESS notification', async () => {
      await service.notifyPaymentSuccess(
        'user-uuid-123',
        5000000,
        'order-uuid-123',
      );

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: NotificationType.PAYMENT_SUCCESS,
          }),
        }),
      );
    });

    it('notifyOrderDelivered should create ORDER_DELIVERED notification', async () => {
      await service.notifyOrderDelivered(
        'user-uuid-123',
        'KLM-2026-00001',
        'order-uuid-123',
      );

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: NotificationType.ORDER_DELIVERED,
          }),
        }),
      );
    });
  });

  // ============================================
  // deleteOldNotifications
  // ============================================
  describe('deleteOldNotifications()', () => {
    it('should delete old read notifications', async () => {
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 10 });

      const result = await service.deleteOldNotifications(30);

      expect(result.deleted).toBe(10);
      expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            readAt: { not: null },
          }),
        }),
      );
    });
  });
});
