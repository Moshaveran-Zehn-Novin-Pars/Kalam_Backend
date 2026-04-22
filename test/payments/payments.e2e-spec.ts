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

const PAYMENT_TEST_PHONES = ['09120000001', '09120000002', '09120000003'];

async function cleanPaymentTestData() {
  const users = await testPrisma.user.findMany({
    where: { phone: { in: PAYMENT_TEST_PHONES } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
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
    await testPrisma.order.deleteMany({
      where: { buyerId: { in: userIds } },
    });

    if (farmerIds.length > 0) {
      await testPrisma.priceHistory.deleteMany({
        where: { product: { farmerId: { in: farmerIds } } },
      });
      await testPrisma.product.deleteMany({
        where: { farmerId: { in: farmerIds } },
      });
      await testPrisma.farmer.deleteMany({ where: { id: { in: farmerIds } } });
    }

    await testPrisma.cartItem.deleteMany({
      where: { cart: { userId: { in: userIds } } },
    });
    await testPrisma.cart.deleteMany({ where: { userId: { in: userIds } } });
    await testPrisma.address.deleteMany({ where: { userId: { in: userIds } } });
    await testPrisma.walletTransaction.deleteMany({
      where: { wallet: { userId: { in: userIds } } },
    });
    await testPrisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
    await testPrisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await testPrisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await testPrisma.category.deleteMany({
    where: { slug: 'test-payment-cat-e2e' },
  });
  await testPrisma.otpCode.deleteMany({
    where: { phone: { in: PAYMENT_TEST_PHONES } },
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

describe('Payments (e2e)', () => {
  let app: INestApplication;
  let buyerToken: string;
  let adminToken: string;
  let productId: string;
  let addressId: string;
  let orderId: string;

  beforeAll(async () => {
    await cleanPaymentTestData();
    app = await createTestApp();

    const category = await testPrisma.category.create({
      data: {
        name: 'تست پرداخت',
        slug: 'test-payment-cat-e2e',
        commissionRate: 0.06,
        isActive: true,
        order: 99,
      },
    });

    const farmerUser = await testPrisma.user.create({
      data: {
        phone: '09120000001',
        role: UserRole.FARMER,
        status: UserStatus.ACTIVE,
        nationalCode: '1200000001',
      },
    });

    const farmer = await testPrisma.farmer.create({
      data: {
        userId: farmerUser.id,
        businessName: 'باغ تست پرداخت',
        ratingAvg: 4.5,
        ratingCount: 5,
        totalSales: 0,
      },
    });

    const product = await testPrisma.product.create({
      data: {
        farmerId: farmer.id,
        categoryId: category.id,
        name: 'محصول تست پرداخت',
        slug: `payment-test-product-${Date.now()}`,
        qualityGrade: QualityGrade.A,
        unit: 'KG',
        pricePerUnit: 10000,
        minOrderQty: 100,
        stockQty: 10000,
        status: ProductStatus.ACTIVE,
      },
    });
    productId = product.id;

    const buyerUser = await testPrisma.user.create({
      data: {
        phone: '09120000002',
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
        nationalCode: '1200000002',
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
        receiverPhone: '09120000002',
        isDefault: true,
      },
    });
    addressId = address.id;

    const adminUser = await testPrisma.user.create({
      data: {
        phone: '09120000003',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        nationalCode: '1200000003',
      },
    });

    buyerToken = await getToken(app, buyerUser.phone);
    adminToken = await getToken(app, adminUser.phone);
  });

  afterAll(async () => {
    await cleanPaymentTestData();
    await app.close();
  });

  // ============================================
  // Wallet Tests
  // ============================================
  describe('Wallet', () => {
    it('GET /payments/wallet - should return wallet', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payments/wallet')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.currency).toBe('IRR');
    });

    it('POST /payments/wallet/deposit - should deposit to wallet', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/wallet/deposit')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amount: 10000000 })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('POST /payments/wallet/deposit - should reject amount less than minimum', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/wallet/deposit')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amount: 5000 })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('GET /payments/wallet/transactions - should return transactions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payments/wallet/transactions')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Scenario: Full Payment Flow
  // ============================================
  describe('Scenario: Full Payment Flow', () => {
    it('Step 1: add to cart and create order', async () => {
      // Add to cart
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, quantity: 100 });

      // Create order
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          addressId,
          paymentMethod: PaymentMethod.WALLET,
        })
        .expect(201);

      orderId = res.body.data.id;
      expect(res.body.data.status).toBe(OrderStatus.PENDING_PAYMENT);
    });

    it('Step 2: pay with wallet', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          orderId,
          method: PaymentMethod.WALLET,
        })
        .expect(201);

      expect(res.body.data.success).toBe(true);
      expect(res.body.data.method).toBe(PaymentMethod.WALLET);
    });

    it('Step 3: order status should be PAID_HELD', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.data.status).toBe(OrderStatus.PAID_HELD);
    });

    it('Step 4: cannot pay again', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          orderId,
          method: PaymentMethod.WALLET,
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('Step 5: get payment info', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/payments/order/${orderId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.data.orderId).toBe(orderId);
    });
  });

  // ============================================
  // Gateway Payment Scenario
  // ============================================
  describe('Scenario: Gateway Payment', () => {
    let gatewayOrderId: string;

    it('Step 1: create order for gateway payment', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, quantity: 100 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          addressId,
          paymentMethod: PaymentMethod.ONLINE_GATEWAY,
        })
        .expect(201);

      gatewayOrderId = res.body.data.id;
    });

    it('Step 2: pay via gateway simulation', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          orderId: gatewayOrderId,
          method: PaymentMethod.ONLINE_GATEWAY,
          gateway: 'ZARINPAL',
        })
        .expect(201);

      expect(res.body.data.success).toBe(true);
      expect(res.body.data.gatewayRef).toBeDefined();
    });
  });

  // ============================================
  // Admin Operations
  // ============================================
  describe('Admin: Refund', () => {
    let refundOrderId: string;

    it('should create and pay an order then cancel it', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ productId, quantity: 100 });

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ addressId, paymentMethod: PaymentMethod.WALLET });

      refundOrderId = orderRes.body.data.id;

      await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ orderId: refundOrderId, method: PaymentMethod.WALLET });

      // Cancel order (باید PAID_HELD باشه تا بشه cancel کرد)
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${refundOrderId}/cancel`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ reason: 'تست استرداد' });
    });

    it('admin can refund cancelled order', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/payments/order/${refundOrderId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.message).toBe('استرداد وجه با موفقیت انجام شد');
    });

    it('non-admin cannot refund', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/payments/order/${refundOrderId}/refund`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(403);
    });
  });
});
