import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, testPrisma } from '../utils';
import { UserRole, UserStatus, OrderStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { RedisService } from '../../src/infrastructure/redis/redis.service';
import { ReviewType } from '../../src/modules/reviews/dto';
import { DisputeStatus } from '@prisma/client';

const REVIEW_TEST_PHONES = ['09140000001', '09140000002', '09140000003'];

async function cleanReviewTestData() {
  const users = await testPrisma.user.findMany({
    where: { phone: { in: REVIEW_TEST_PHONES } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    await testPrisma.dispute.deleteMany({
      where: { order: { buyerId: { in: userIds } } },
    });
    await testPrisma.review.deleteMany({
      where: { authorId: { in: userIds } },
    });
    const farmers = await testPrisma.farmer.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const farmerIds = farmers.map((f) => f.id);

    await testPrisma.orderStatusHistory.deleteMany({
      where: { order: { buyerId: { in: userIds } } },
    });
    await testPrisma.escrow.deleteMany({
      where: { order: { buyerId: { in: userIds } } },
    });
    await testPrisma.payment.deleteMany({
      where: { order: { buyerId: { in: userIds } } },
    });
    await testPrisma.orderItem.deleteMany({
      where: { order: { buyerId: { in: userIds } } },
    });
    await testPrisma.order.deleteMany({ where: { buyerId: { in: userIds } } });

    if (farmerIds.length > 0) {
      await testPrisma.priceHistory.deleteMany({
        where: { product: { farmerId: { in: farmerIds } } },
      });
      await testPrisma.product.deleteMany({
        where: { farmerId: { in: farmerIds } },
      });
      await testPrisma.farmer.deleteMany({ where: { id: { in: farmerIds } } });
    }

    await testPrisma.walletTransaction.deleteMany({
      where: { wallet: { userId: { in: userIds } } },
    });
    await testPrisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
    await testPrisma.address.deleteMany({ where: { userId: { in: userIds } } });
    await testPrisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await testPrisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await testPrisma.category.deleteMany({
    where: { slug: 'test-review-cat-e2e' },
  });
  await testPrisma.otpCode.deleteMany({
    where: { phone: { in: REVIEW_TEST_PHONES } },
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

describe('Reviews & Disputes (e2e)', () => {
  let app: INestApplication;
  let buyerToken: string;
  let adminToken: string;
  let buyerUserId: string;
  let farmerUserId: string;
  let farmerId: string;
  let orderId: string;

  beforeAll(async () => {
    await cleanReviewTestData();
    app = await createTestApp();

    const category = await testPrisma.category.create({
      data: {
        name: 'تست امتیاز',
        slug: 'test-review-cat-e2e',
        commissionRate: 0.06,
        isActive: true,
        order: 99,
      },
    });

    const farmerUser = await testPrisma.user.create({
      data: {
        phone: '09140000001',
        role: UserRole.FARMER,
        status: UserStatus.ACTIVE,
        nationalCode: '1400000001',
        firstName: 'محمد',
        lastName: 'باغدار',
      },
    });
    farmerUserId = farmerUser.id;

    const farmer = await testPrisma.farmer.create({
      data: {
        userId: farmerUser.id,
        businessName: 'باغ تست امتیاز',
        ratingAvg: 0,
        ratingCount: 0,
        totalSales: 0,
      },
    });
    farmerId = farmer.id;

    const product = await testPrisma.product.create({
      data: {
        farmerId: farmer.id,
        categoryId: category.id,
        name: 'محصول تست امتیاز',
        slug: `review-test-product-${Date.now()}`,
        qualityGrade: 'A',
        unit: 'KG',
        pricePerUnit: 10000,
        minOrderQty: 100,
        stockQty: 10000,
        status: 'ACTIVE',
      },
    });

    const buyerUser = await testPrisma.user.create({
      data: {
        phone: '09140000002',
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
        nationalCode: '1400000002',
      },
    });
    buyerUserId = buyerUser.id;
    console.log(buyerUserId);

    const adminUser = await testPrisma.user.create({
      data: {
        phone: '09140000003',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        nationalCode: '1400000003',
      },
    });

    const address = await testPrisma.address.create({
      data: {
        userId: buyerUser.id,
        title: 'انبار',
        fullAddress: 'تهران',
        province: 'تهران',
        city: 'تهران',
        lat: 35.6892,
        lng: 51.389,
        receiverName: 'خریدار',
        receiverPhone: '09140000002',
        isDefault: true,
      },
    });

    buyerToken = await getToken(app, buyerUser.phone);
    adminToken = await getToken(app, adminUser.phone);

    // Create completed order directly in DB
    const order = await testPrisma.order.create({
      data: {
        orderNumber: `KLM-2026-REV01`,
        buyerId: buyerUser.id,
        addressId: address.id,
        status: OrderStatus.DELIVERED,
        subtotal: 1000000,
        deliveryFee: 500000,
        tax: 90000,
        total: 1590000,
        commissionTotal: 60000,
        paymentMethod: 'ONLINE_GATEWAY',
        items: {
          create: {
            productId: product.id,
            farmerId: farmer.id,
            productName: product.name,
            quantity: 100,
            unit: 'KG',
            pricePerUnit: 10000,
            subtotal: 1000000,
            commissionRate: 0.06,
            commission: 60000,
          },
        },
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    await cleanReviewTestData();
    await app.close();
  });

  // ============================================
  // Reviews
  // ============================================
  describe('Reviews', () => {
    it('POST /reviews - buyer can review farmer', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          orderId,
          targetId: farmerUserId,
          rating: 5,
          comment: 'محصول عالی بود',
          type: ReviewType.BUYER_REVIEWS_FARMER,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.rating).toBe(5);
    });

    it('POST /reviews - cannot review same order twice', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          orderId,
          targetId: farmerUserId,
          rating: 4,
          type: ReviewType.BUYER_REVIEWS_FARMER,
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('GET /reviews/user/:userId - should return user reviews (public)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reviews/user/${farmerUserId}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /reviews/farmer/:farmerId - should return farmer reviews', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reviews/farmer/${farmerId}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('farmer rating should be updated', async () => {
      const farmer = await testPrisma.farmer.findUnique({
        where: { id: farmerId },
      });
      expect(farmer?.ratingAvg.toNumber()).toBe(5);
      expect(farmer?.ratingCount).toBe(1);
    });
  });

  // ============================================
  // Disputes
  // ============================================
  describe('Disputes', () => {
    let disputeId: string;

    it('POST /disputes - buyer can create dispute', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/disputes')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          orderId,
          reason: 'محصول با توضیحات مطابقت نداشت',
          description: 'محصول ارسال شده کیفیت پایین‌تری داشت',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(DisputeStatus.OPEN);
      disputeId = res.body.data.id;
    });

    it('POST /disputes - cannot create duplicate dispute', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/disputes')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          orderId,
          reason: 'دوباره',
          description: 'توضیحات',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('GET /disputes/my - buyer can view own disputes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/disputes/my')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /disputes/:id - buyer can view own dispute', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/disputes/${disputeId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(disputeId);
    });

    it('GET /disputes - admin can view all disputes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/disputes')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('GET /disputes - non-admin cannot view all disputes', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/disputes')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(403);
    });

    it('PATCH /disputes/:id/status - admin updates status to UNDER_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/disputes/${disputeId}/status?status=UNDER_REVIEW`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.status).toBe(DisputeStatus.UNDER_REVIEW);
    });

    it('POST /disputes/:id/resolve - admin resolves dispute', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/disputes/${disputeId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resolution: 'استرداد ۵۰٪ مبلغ به خریدار' })
        .expect(200);

      expect(res.body.data.message).toBe('اعتراض با موفقیت حل شد');
    });

    it('dispute should be RESOLVED after admin resolves', async () => {
      const dispute = await testPrisma.dispute.findUnique({
        where: { id: disputeId },
      });
      expect(dispute?.status).toBe(DisputeStatus.RESOLVED);
    });
  });
});
