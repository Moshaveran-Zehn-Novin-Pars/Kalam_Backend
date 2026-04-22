import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, testPrisma, cleanUsersTestData } from '../utils';
import { UserRole, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { RedisService } from '../../src/infrastructure/redis/redis.service';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let farmerToken: string;
  let adminId: string;
  let farmerId: string;
  // ============================================
  // Setup
  // ============================================
  beforeAll(async () => {
    await cleanUsersTestData();
    app = await createTestApp();

    // پاک کردن Redis برای این phones
    const redisService = app.get(RedisService);
    for (const phone of ['09100000011', '09111111121']) {
      await redisService.del(`otp:rate:${phone}`);
      await redisService.del(`otp:block:${phone}`);
      await redisService.del(`otp:${phone}`);
      await redisService.del(`otp:attempts:${phone}`);
    }

    const admin = await testPrisma.user.create({
      data: {
        phone: '09100000011',
        firstName: 'علی',
        lastName: 'مدیر',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        nationalCode: '0011111111',
      },
    });

    const farmer = await testPrisma.user.create({
      data: {
        phone: '09111111121',
        firstName: 'محمد',
        lastName: 'باغدار',
        role: UserRole.FARMER,
        status: UserStatus.ACTIVE,
        nationalCode: '1111111121',
      },
    });

    adminId = admin.id;
    farmerId = farmer.id;

    adminToken = await getToken(app, admin.phone);
    farmerToken = await getToken(app, farmer.phone);
  });

  afterAll(async () => {
    await cleanUsersTestData();
    await app.close();
  });

  // ============================================
  // GET /users (Admin only)
  // ============================================
  describe('GET /users', () => {
    it('should return users list for admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.meta).toBeDefined();
    });

    it('should reject non-admin access', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${farmerToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject unauthenticated access', async () => {
      await request(app.getHttpServer()).get('/api/v1/users').expect(401);
    });

    it('should support pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users?page=1&pageSize=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.meta.pageSize).toBe(5);
      expect(res.body.meta.page).toBe(1);
    });

    it('should filter by role', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users?role=FARMER')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      if (res.body.data.length > 0) {
        res.body.data.forEach((user: { role: string }) => {
          expect(user.role).toBe('FARMER');
        });
      }
    });
  });

  // ============================================
  // GET /users/profile
  // ============================================
  describe('GET /users/profile', () => {
    it('should return current user profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/profile')
        .set('Authorization', `Bearer ${farmerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.phone).toBe('09111111121');
      expect(res.body.data.role).toBe(UserRole.FARMER);
    });

    it('should reject unauthenticated access', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/profile')
        .expect(401);
    });
  });

  // ============================================
  // PATCH /users/profile
  // ============================================
  describe('PATCH /users/profile', () => {
    it('should update profile successfully', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({ firstName: 'احمد', lastName: 'کریمی' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.firstName).toBe('احمد');
      expect(res.body.data.lastName).toBe('کریمی');
    });

    it('should update email successfully', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should reject invalid email', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================
  // GET /users/:id (Admin only)
  // ============================================
  describe('GET /users/:id', () => {
    it('should return user by id for admin', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${farmerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(farmerId);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('should reject non-admin access', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/users/${adminId}`)
        .set('Authorization', `Bearer ${farmerToken}`)
        .expect(403);
    });
  });

  // ============================================
  // Scenario: Admin manages users
  // ============================================
  describe('Scenario: Admin manages users', () => {
    let targetUserId: string;

    beforeAll(async () => {
      const user = await testPrisma.user.create({
        data: {
          phone: '09155555551',
          role: UserRole.BUYER,
          status: UserStatus.ACTIVE,
          nationalCode: '5555555551',
        },
      });
      targetUserId = user.id;
    });

    it('Step 1: admin can suspend a user', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${targetUserId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'تخلف از قوانین' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('کاربر با موفقیت تعلیق شد');
    });

    it('Step 2: suspended user should have SUSPENDED status', async () => {
      const user = await testPrisma.user.findUnique({
        where: { id: targetUserId },
      });
      expect(user?.status).toBe(UserStatus.SUSPENDED);
    });

    it('Step 3: admin can activate suspended user', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${targetUserId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.message).toBe('کاربر با موفقیت فعال شد');
    });

    it('Step 4: admin can delete a user (soft delete)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/users/${targetUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.message).toBe('کاربر با موفقیت حذف شد');
    });

    it('Step 5: deleted user should not be found', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${targetUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });
});

// ============================================
// Helper: Get Token via OTP Flow
// ============================================
async function getToken(app: INestApplication, phone: string): Promise<string> {
  const knownOtp = '123456';
  const hashedOtp = crypto.createHash('sha256').update(knownOtp).digest('hex');

  // پاک کردن rate limit و OTP قبلی
  const redisService = app.get(RedisService);
  await redisService.del(`otp:rate:${phone}`);
  await redisService.del(`otp:block:${phone}`);
  await redisService.del(`otp:${phone}`);
  await redisService.del(`otp:attempts:${phone}`);

  // ست کردن OTP مستقیم در Redis
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
