import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, testPrisma } from '../utils';
import { UserRole, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { RedisService } from '../../src/infrastructure/redis/redis.service';

const FARMER_TEST_PHONES = ['09177777771', '09177777772'];

async function cleanFarmerTestData() {
  const users = await testPrisma.user.findMany({
    where: { phone: { in: FARMER_TEST_PHONES } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    await testPrisma.farmer.deleteMany({ where: { userId: { in: userIds } } });
    await testPrisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await testPrisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
    await testPrisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await testPrisma.otpCode.deleteMany({
    where: { phone: { in: FARMER_TEST_PHONES } },
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

describe('Farmers (e2e)', () => {
  let app: INestApplication;
  let farmerToken: string;
  let adminToken: string;
  let farmerId: string;

  beforeAll(async () => {
    await cleanFarmerTestData();
    app = await createTestApp();

    const farmerUser = await testPrisma.user.create({
      data: {
        phone: '09177777771',
        role: UserRole.FARMER,
        status: UserStatus.ACTIVE,
        nationalCode: '7777777771',
        firstName: 'محمد',
        lastName: 'باغدار',
      },
    });

    const farmer = await testPrisma.farmer.create({
      data: {
        userId: farmerUser.id,
        businessName: 'باغ سیب طلایی',
        farmLocation: 'اصفهان',
        ratingAvg: 4.5,
        ratingCount: 10,
        totalSales: 0,
      },
    });

    farmerId = farmer.id;

    const adminUser = await testPrisma.user.create({
      data: {
        phone: '09177777772',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        nationalCode: '7777777772',
      },
    });

    farmerToken = await getToken(app, farmerUser.phone);
    adminToken = await getToken(app, adminUser.phone);
  });

  afterAll(async () => {
    await cleanFarmerTestData();
    await app.close();
  });

  // ============================================
  // GET /farmers (public)
  // ============================================
  describe('GET /farmers', () => {
    it('should return farmers list without auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/farmers')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.meta).toBeDefined();
    });

    it('should support search', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/farmers?search=باغ')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should support pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/farmers?page=1&pageSize=5')
        .expect(200);

      expect(res.body.meta.pageSize).toBe(5);
    });
  });

  // ============================================
  // GET /farmers/:id (public)
  // ============================================
  describe('GET /farmers/:id', () => {
    it('should return farmer by id without auth', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/farmers/${farmerId}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(farmerId);
      expect(res.body.data.businessName).toBe('باغ سیب طلایی');
    });

    it('should return 404 for non-existent farmer', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/farmers/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================
  // GET /farmers/me
  // ============================================
  describe('GET /farmers/me', () => {
    it('should return my profile for farmer', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/farmers/me')
        .set('Authorization', `Bearer ${farmerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.businessName).toBe('باغ سیب طلایی');
    });

    it('should reject non-farmer access', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/farmers/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/farmers/me').expect(401);
    });
  });

  // ============================================
  // PATCH /farmers/me
  // ============================================
  describe('PATCH /farmers/me', () => {
    it('should update farmer profile', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/farmers/me')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({ businessName: 'باغ سیب نقره‌ای', farmLocation: 'شیراز' })
        .expect(200);

      expect(res.body.data.businessName).toBe('باغ سیب نقره‌ای');
    });

    it('should reject non-farmer access', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/farmers/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ businessName: 'test' })
        .expect(403);
    });
  });

  // ============================================
  // PATCH /farmers/:id/verify (Admin)
  // ============================================
  describe('PATCH /farmers/:id/verify', () => {
    it('should verify farmer as admin', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/farmers/${farmerId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.verifiedAt).toBeDefined();
    });

    it('should reject non-admin access', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/farmers/${farmerId}/verify`)
        .set('Authorization', `Bearer ${farmerToken}`)
        .expect(403);
    });
  });
});
