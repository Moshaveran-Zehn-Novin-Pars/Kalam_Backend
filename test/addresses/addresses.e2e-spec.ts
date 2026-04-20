import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, testPrisma } from '../utils';
import { UserRole, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { RedisService } from '../../src/infrastructure/redis/redis.service';

// ============================================
// Test phones
// ============================================
const ADDR_TEST_PHONES = ['09166666661', '09166666662'];

async function cleanAddressTestData() {
  const users = await testPrisma.user.findMany({
    where: { phone: { in: ADDR_TEST_PHONES } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    await testPrisma.address.deleteMany({
      where: { userId: { in: userIds } },
    });
    await testPrisma.session.deleteMany({
      where: { userId: { in: userIds } },
    });
    await testPrisma.wallet.deleteMany({
      where: { userId: { in: userIds } },
    });
    await testPrisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }

  await testPrisma.otpCode.deleteMany({
    where: { phone: { in: ADDR_TEST_PHONES } },
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

// ============================================
// Tests
// ============================================
describe('Addresses (e2e)', () => {
  let app: INestApplication;
  let buyerToken: string;
  let otherToken: string;

  beforeAll(async () => {
    await cleanAddressTestData();
    app = await createTestApp();

    await testPrisma.user.create({
      data: {
        phone: '09166666661',
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
        nationalCode: '6666666661',
      },
    });

    await testPrisma.user.create({
      data: {
        phone: '09166666662',
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
        nationalCode: '6666666662',
      },
    });

    buyerToken = await getToken(app, '09166666661');
    otherToken = await getToken(app, '09166666662');
  });

  afterAll(async () => {
    await cleanAddressTestData();
    await app.close();
  });

  const createAddressDto = {
    title: 'انبار اصلی',
    fullAddress: 'تهران، خیابان ولیعصر، پلاک ۱۲۳',
    province: 'تهران',
    city: 'تهران',
    postalCode: '1234567890',
    lat: 35.6892,
    lng: 51.389,
    receiverName: 'علی محمدی',
    receiverPhone: '09123456789',
  };

  // ============================================
  // POST /addresses
  // ============================================
  describe('POST /addresses', () => {
    it('should create address successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(createAddressDto)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('انبار اصلی');
      expect(res.body.data.isDefault).toBe(true);
    });

    it('should set first address as default automatically', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ ...createAddressDto, title: 'شعبه دوم' })
        .expect(201);

      expect(res.body.data.isDefault).toBe(false);
    });

    it('should reject invalid phone number', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ ...createAddressDto, receiverPhone: 'invalid' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject invalid postal code', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ ...createAddressDto, postalCode: '12345' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ title: 'test' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .send(createAddressDto)
        .expect(401);
    });
  });

  // ============================================
  // GET /addresses
  // ============================================
  describe('GET /addresses', () => {
    it('should return addresses for current user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should not return other user addresses', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/addresses').expect(401);
    });
  });

  // ============================================
  // Scenario: Full Address Management
  // ============================================
  describe('Scenario: Full Address Management', () => {
    let addressId: string;
    let secondAddressId: string;

    it('Step 1: create first address (auto default)', async () => {
      // پاک کردن آدرس‌های قبلی برای این test scenario
      const user = await testPrisma.user.findUnique({
        where: { phone: '09166666661' },
      });
      await testPrisma.address.deleteMany({ where: { userId: user!.id } });

      const res = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(createAddressDto)
        .expect(201);

      addressId = res.body.data.id;
      expect(res.body.data.isDefault).toBe(true);
    });

    it('Step 2: create second address (not default)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ ...createAddressDto, title: 'شعبه دوم' })
        .expect(201);

      secondAddressId = res.body.data.id;
      expect(res.body.data.isDefault).toBe(false);
    });

    it('Step 3: get address by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/addresses/${addressId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(addressId);
    });

    it('Step 4: update address', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/addresses/${addressId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ title: 'انبار اصلی (ویرایش شده)' })
        .expect(200);

      expect(res.body.data.title).toBe('انبار اصلی (ویرایش شده)');
    });

    it('Step 5: set second address as default', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/addresses/${secondAddressId}/set-default`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.data.message).toBe('آدرس پیش‌فرض با موفقیت تنظیم شد');

      // Check in DB
      const addr = await testPrisma.address.findUnique({
        where: { id: secondAddressId },
      });
      expect(addr?.isDefault).toBe(true);

      const firstAddr = await testPrisma.address.findUnique({
        where: { id: addressId },
      });
      expect(firstAddr?.isDefault).toBe(false);
    });

    it('Step 6: cannot access other user address', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/addresses/${addressId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    it('Step 7: delete address', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/addresses/${addressId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.data.message).toBe('آدرس با موفقیت حذف شد');
    });

    it('Step 8: deleted address not found', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/addresses/${addressId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(404);
    });
  });
});
