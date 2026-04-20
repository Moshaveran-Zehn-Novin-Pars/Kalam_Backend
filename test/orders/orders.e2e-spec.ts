import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, testPrisma } from '../utils';
import {
  UserRole,
  UserStatus,
  ProductStatus,
  QualityGrade,
  PaymentMethod,
  OrderStatus,
} from '@prisma/client';
import * as crypto from 'crypto';
import { RedisService } from '../../src/infrastructure/redis/redis.service';

const ORDER_TEST_PHONES = ['09199999991', '09199999992', '09199999993'];

async function cleanOrderTestData() {
  const users = await testPrisma.user.findMany({
    where: { phone: { in: ORDER_TEST_PHONES } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    const farmers = await testPrisma.farmer.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const farmerIds = farmers.map((f) => f.id);

    // ابتدا order-related data
    await testPrisma.orderStatusHistory.deleteMany({
      where: { order: { buyerId: { in: userIds } } },
    });
    await testPrisma.orderItem.deleteMany({
      where: { order: { buyerId: { in: userIds } } },
    });
    await testPrisma.order.deleteMany({
      where: { buyerId: { in: userIds } },
    });

    // بعد product-related data
    if (farmerIds.length > 0) {
      await testPrisma.priceHistory.deleteMany({
        where: { product: { farmerId: { in: farmerIds } } },
      });
      await testPrisma.productImage.deleteMany({
        where: { product: { farmerId: { in: farmerIds } } },
      });
      await testPrisma.product.deleteMany({
        where: { farmerId: { in: farmerIds } },
      });
      await testPrisma.farmer.deleteMany({
        where: { id: { in: farmerIds } },
      });
    }

    // بعد cart و address
    await testPrisma.cartItem.deleteMany({
      where: { cart: { userId: { in: userIds } } },
    });
    await testPrisma.cart.deleteMany({
      where: { userId: { in: userIds } },
    });
    await testPrisma.address.deleteMany({
      where: { userId: { in: userIds } },
    });

    // در آخر user-related
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

  await testPrisma.category.deleteMany({
    where: { slug: 'test-order-cat-e2e' },
  });
  await testPrisma.otpCode.deleteMany({
    where: { phone: { in: ORDER_TEST_PHONES } },
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

describe('Cart & Orders (e2e)', () => {
  let app: INestApplication;
  let buyerToken: string;
  let farmerToken: string;
  let adminToken: string;
  let productId: string;
  let addressId: string;
  let categoryId: string;

  beforeAll(async () => {
    await cleanOrderTestData();
    app = await createTestApp();

    // Create category
    const category = await testPrisma.category.create({
      data: {
        name: 'تست سفارش',
        slug: 'test-order-cat-e2e',
        commissionRate: 0.06,
        isActive: true,
        order: 99,
      },
    });
    categoryId = category.id;

    // Create farmer user
    const farmerUser = await testPrisma.user.create({
      data: {
        phone: '09199999991',
        role: UserRole.FARMER,
        status: UserStatus.ACTIVE,
        nationalCode: '9999999991',
        firstName: 'محمد',
        lastName: 'باغدار',
      },
    });

    const farmer = await testPrisma.farmer.create({
      data: {
        userId: farmerUser.id,
        businessName: 'باغ تست سفارش',
        ratingAvg: 4.5,
        ratingCount: 5,
        totalSales: 0,
      },
    });

    // Create product
    const product = await testPrisma.product.create({
      data: {
        farmerId: farmer.id,
        categoryId,
        name: 'محصول تست سفارش',
        slug: `order-test-product-${Date.now()}`,
        qualityGrade: QualityGrade.A,
        unit: 'KG',
        pricePerUnit: 45000,
        minOrderQty: 100,
        stockQty: 10000,
        status: ProductStatus.ACTIVE,
      },
    });
    productId = product.id;

    // Create buyer user
    const buyerUser = await testPrisma.user.create({
      data: {
        phone: '09199999992',
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
        nationalCode: '9999999992',
      },
    });

    // Create address for buyer
    const address = await testPrisma.address.create({
      data: {
        userId: buyerUser.id,
        title: 'انبار اصلی',
        fullAddress: 'تهران، خیابان ولیعصر',
        province: 'تهران',
        city: 'تهران',
        lat: 35.6892,
        lng: 51.389,
        receiverName: 'رضا خریدار',
        receiverPhone: '09199999992',
        isDefault: true,
      },
    });
    addressId = address.id;

    // Create admin user
    const adminUser = await testPrisma.user.create({
      data: {
        phone: '09199999993',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        nationalCode: '9999999993',
      },
    });

    buyerToken = await getToken(app, buyerUser.phone);
    farmerToken = await getToken(app, farmerUser.phone);
    adminToken = await getToken(app, adminUser.phone);
  });

  afterAll(async () => {
    await cleanOrderTestData();
    await app.close();
  });

  // ============================================
  // Cart Tests
  // ============================================
  describe('Cart', () => {
    it('GET /cart - should return empty cart', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(0);
    });

    it('POST /cart/items - should add item to cart', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, quantity: 200 })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.summary.itemCount).toBe(1);
    });

    it('POST /cart/items - should reject quantity less than MOQ', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, quantity: 50 })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('PATCH /cart/items/:productId - should update quantity', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/cart/items/${productId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ quantity: 300 })
        .expect(200);

      expect(res.body.data.items[0].quantity).toBe(300);
    });

    it('DELETE /cart/items/:productId - should remove item', async () => {
      // First add item back
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, quantity: 200 });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/cart/items/${productId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
    });
  });

  // ============================================
  // Orders - Full Scenario
  // ============================================
  describe('Scenario: Full Order Flow', () => {
    let orderId: string;

    it('Step 1: add product to cart', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, quantity: 500 })
        .expect(201);

      expect(res.body.data.items).toHaveLength(1);
    });

    it('Step 2: create order from cart', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          addressId,
          paymentMethod: PaymentMethod.ONLINE_GATEWAY,
          notes: 'لطفاً تازه باشد',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(OrderStatus.PENDING_PAYMENT);
      expect(res.body.data.orderNumber).toMatch(/^KLM-\d{4}-\d{5}$/);
      orderId = res.body.data.id;
    });

    it('Step 3: cart should be empty after order', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
    });

    it('Step 4: buyer can view own order', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(orderId);
      expect(res.body.data.items).toHaveLength(1);
    });

    it('Step 5: admin can view order', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(orderId);
    });

    it('Step 6: farmer cannot view buyer order', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${farmerToken}`)
        .expect(403);
    });

    it('Step 7: buyer can cancel pending order', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ reason: 'تغییر برنامه' })
        .expect(200);

      expect(res.body.data.message).toBe('سفارش با موفقیت لغو شد');
    });

    it('Step 8: cancelled order cannot be cancelled again', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ reason: 'test' })
        .expect(400);
    });

    it('Step 9: cannot create order with empty cart', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          addressId,
          paymentMethod: PaymentMethod.ONLINE_GATEWAY,
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================
  // Orders - List + Admin
  // ============================================
  describe('Orders List', () => {
    it('GET /orders - should return my orders', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.meta).toBeDefined();
    });

    it('GET /orders/admin - should return all orders for admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('GET /orders/admin - should reject non-admin', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/orders/admin')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(403);
    });
  });
});
