import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, testPrisma } from '../utils';
import { UserRole, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import {
  NotificationType,
  NotificationChannel,
} from '../../src/modules/notifications/notifications.service';

const NOTIF_TEST_PHONES = ['09150000001', '09150000002'];

async function cleanNotificationTestData() {
  const users = await testPrisma.user.findMany({
    where: { phone: { in: NOTIF_TEST_PHONES } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    await testPrisma.notification.deleteMany({
      where: { userId: { in: userIds } },
    });
    await testPrisma.session.deleteMany({
      where: { userId: { in: userIds } },
    });
    await testPrisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await testPrisma.otpCode.deleteMany({
    where: { phone: { in: NOTIF_TEST_PHONES } },
  });
}

async function getToken(app: INestApplication, phone: string): Promise<string> {
  const knownOtp = '123456';
  const hashedOtp = crypto.createHash('sha256').update(knownOtp).digest('hex');
  const redisService = app.get(RedisService);
  await redisService.del(`otp:rate:${phone}`);
  await redisService.del(`otp:block:${phone}`);
  await redisService.set(
    `otp:${phone}`,
    JSON.stringify({ code: hashedOtp, phone }),
    120,
  );
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/verify-otp')
    .send({ phone, code: knownOtp });
  return res.body.data?.accessToken ?? '';
}

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let userToken: string;
  let adminToken: string;
  let userId: string;
  let notificationId: string;

  beforeAll(async () => {
    await cleanNotificationTestData();
    app = await createTestApp();

    const user = await testPrisma.user.create({
      data: {
        phone: '09150000001',
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
        nationalCode: '1500000001',
      },
    });
    userId = user.id;

    const admin = await testPrisma.user.create({
      data: {
        phone: '09150000002',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        nationalCode: '1500000002',
      },
    });

    userToken = await getToken(app, user.phone);
    adminToken = await getToken(app, admin.phone);

    // Seed some notifications
    await testPrisma.notification.createMany({
      data: [
        {
          userId,
          type: NotificationType.ORDER_CREATED,
          title: 'سفارش ثبت شد',
          message: 'سفارش KLM-2026-00001 ثبت شد',
          channel: NotificationChannel.IN_APP,
        },
        {
          userId,
          type: NotificationType.PAYMENT_SUCCESS,
          title: 'پرداخت موفق',
          message: 'پرداخت با موفقیت انجام شد',
          channel: NotificationChannel.IN_APP,
        },
        {
          userId,
          type: NotificationType.ORDER_DELIVERED,
          title: 'سفارش تحویل داده شد',
          message: 'سفارش شما تحویل داده شد',
          channel: NotificationChannel.IN_APP,
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanNotificationTestData();
    await app.close();
  });

  // ============================================
  // GET /notifications
  // ============================================
  describe('GET /notifications', () => {
    it('should return my notifications', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.meta.unreadCount).toBeGreaterThan(0);
    });

    it('should filter unread only', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications?unreadOnly=true')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      res.body.data.forEach((n: { readAt: null }) => {
        expect(n.readAt).toBeNull();
      });
    });

    it('should support pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications?page=1&pageSize=2')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.meta.pageSize).toBe(2);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .expect(401);
    });
  });

  // ============================================
  // GET /notifications/unread-count
  // ============================================
  describe('GET /notifications/unread-count', () => {
    it('should return unread count', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.unreadCount).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Scenario: Read notifications
  // ============================================
  describe('Scenario: Read Notifications', () => {
    it('Step 1: get first notification ID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications?pageSize=1')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      notificationId = res.body.data[0].id;
      expect(notificationId).toBeDefined();
    });

    it('Step 2: mark one as read', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.data.readAt).not.toBeNull();
    });

    it('Step 3: unread count should decrease', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.data.unreadCount).toBe(2);
    });

    it('Step 4: mark all as read', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.data.message).toBe('همه اعلان‌ها خوانده شدند');
    });

    it('Step 5: unread count should be 0', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.data.unreadCount).toBe(0);
    });

    it('Step 6: unread only filter should return empty', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications?unreadOnly=true')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      // همه اعلان‌ها باید readAt داشته باشن
      res.body.data.forEach((n: { readAt: string | null }) => {
        expect(n.readAt).not.toBeNull();
      });
    });
  });

  // ============================================
  // Admin cleanup
  // ============================================
  describe('Admin', () => {
    it('POST /notifications/cleanup - admin can cleanup old notifications', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications/cleanup')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.deleted).toBeDefined();
    });

    it('non-admin cannot cleanup', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/notifications/cleanup')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });
});
