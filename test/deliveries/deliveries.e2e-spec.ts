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
  DeliveryStatus,
} from '@prisma/client';
import * as crypto from 'crypto';
import { RedisService } from '../../src/infrastructure/redis/redis.service';

const DELIVERY_TEST_PHONES = [
  '09130000001',
  '09130000002',
  '09130000003',
  '09130000004',
];

async function cleanDeliveryTestData() {
  const users = await testPrisma.user.findMany({
    where: { phone: { in: DELIVERY_TEST_PHONES } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    const farmers = await testPrisma.farmer.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const farmerIds = farmers.map((f) => f.id);

    await testPrisma.deliveryLocation.deleteMany({
      where: { delivery: { order: { buyerId: { in: userIds } } } },
    });
    await testPrisma.delivery.deleteMany({
      where: { order: { buyerId: { in: userIds } } },
    });
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

    await testPrisma.driver.deleteMany({ where: { userId: { in: userIds } } });
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
    where: { slug: 'test-delivery-cat-e2e' },
  });
  await testPrisma.otpCode.deleteMany({
    where: { phone: { in: DELIVERY_TEST_PHONES } },
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

describe('Deliveries (e2e)', () => {
  let app: INestApplication;
  let buyerToken: string;
  let driverToken: string;
  let adminToken: string;
  let orderId: string;
  let deliveryId: string;
  let driverId: string;

  beforeAll(async () => {
    await cleanDeliveryTestData();
    app = await createTestApp();

    const category = await testPrisma.category.create({
      data: {
        name: 'تست حمل',
        slug: 'test-delivery-cat-e2e',
        commissionRate: 0.06,
        isActive: true,
        order: 99,
      },
    });

    const farmerUser = await testPrisma.user.create({
      data: {
        phone: '09130000001',
        role: UserRole.FARMER,
        status: UserStatus.ACTIVE,
        nationalCode: '1300000001',
      },
    });

    const farmer = await testPrisma.farmer.create({
      data: {
        userId: farmerUser.id,
        businessName: 'باغ تست حمل',
        ratingAvg: 4.5,
        ratingCount: 5,
        totalSales: 0,
      },
    });

    const product = await testPrisma.product.create({
      data: {
        farmerId: farmer.id,
        categoryId: category.id,
        name: 'محصول تست حمل',
        slug: `delivery-test-product-${Date.now()}`,
        qualityGrade: QualityGrade.A,
        unit: 'KG',
        pricePerUnit: 10000,
        minOrderQty: 100,
        stockQty: 10000,
        status: ProductStatus.ACTIVE,
      },
    });

    const buyerUser = await testPrisma.user.create({
      data: {
        phone: '09130000002',
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
        nationalCode: '1300000002',
      },
    });

    const address = await testPrisma.address.create({
      data: {
        userId: buyerUser.id,
        title: 'انبار',
        fullAddress: 'تهران',
        province: 'تهران',
        city: 'تهران',
        lat: 35.7,
        lng: 51.4,
        receiverName: 'خریدار',
        receiverPhone: '09130000002',
        isDefault: true,
      },
    });

    const driverUser = await testPrisma.user.create({
      data: {
        phone: '09130000003',
        role: UserRole.DRIVER,
        status: UserStatus.ACTIVE,
        nationalCode: '1300000003',
      },
    });

    const driver = await testPrisma.driver.create({
      data: {
        userId: driverUser.id,
        vehicleType: 'VAN',
        vehiclePlate: '13ایران000',
        capacityKg: 1000,
        hasRefrigeration: false,
        licenseNumber: 'DL13000',
        licenseExpiresAt: new Date('2027-01-01'),
        isAvailable: true,
        ratingAvg: 4.8,
        ratingCount: 10,
        ordersDelivered: 5,
      },
    });
    driverId = driver.id;

    const adminUser = await testPrisma.user.create({
      data: {
        phone: '09130000004',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        nationalCode: '1300000004',
      },
    });

    buyerToken = await getToken(app, buyerUser.phone);
    driverToken = await getToken(app, driverUser.phone);
    adminToken = await getToken(app, adminUser.phone);

    // Create wallet and deposit for buyer
    await request(app.getHttpServer())
      .post('/api/v1/payments/wallet/deposit')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ amount: 10000000 });

    // Add to cart
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ productId: product.id, quantity: 100 });

    // Create order
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        addressId: address.id,
        paymentMethod: PaymentMethod.WALLET,
      });
    orderId = orderRes.body.data.id;

    // Pay order
    await request(app.getHttpServer())
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ orderId, method: PaymentMethod.WALLET });

    // Farmer confirms order (manually update DB for test)
    await testPrisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CONFIRMED },
    });
  });

  afterAll(async () => {
    await cleanDeliveryTestData();
    await app.close();
  });

  // ============================================
  // Scenario: Full Delivery Flow
  // ============================================
  describe('Scenario: Full Delivery Flow', () => {
    it('Step 1: admin creates delivery', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/deliveries/order/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(DeliveryStatus.PENDING_ASSIGNMENT);
      deliveryId = res.body.data.id;
    });

    it('Step 2: admin assigns driver', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${deliveryId}/assign-driver`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ driverId })
        .expect(200);

      expect(res.body.data.status).toBe(DeliveryStatus.ASSIGNED);
      expect(res.body.data.driverId).toBe(driverId);
    });

    it('Step 3: buyer can view delivery', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/deliveries/order/${orderId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(deliveryId);
    });

    it('Step 4: driver updates status to PICKING_UP', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${deliveryId}/status?status=PICKING_UP`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.data.status).toBe(DeliveryStatus.PICKING_UP);
    });

    it('Step 5: driver updates location', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${deliveryId}/location`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ lat: 35.695, lng: 51.395 })
        .expect(200);

      expect(res.body.data.message).toBe('موقعیت با موفقیت بروزرسانی شد');
    });

    it('Step 6: driver updates status to IN_TRANSIT', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${deliveryId}/status?status=IN_TRANSIT`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.data.status).toBe(DeliveryStatus.IN_TRANSIT);
    });

    it('Step 7: order status should be SHIPPING', async () => {
      const order = await testPrisma.order.findUnique({
        where: { id: orderId },
      });
      expect(order?.status).toBe(OrderStatus.SHIPPING);
    });

    it('Step 8: driver confirms delivery', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${deliveryId}/confirm`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          proofImage: 'https://example.com/proof.jpg',
          recipientName: 'علی خریدار',
        })
        .expect(200);

      expect(res.body.data.message).toBe('تحویل با موفقیت تأیید شد');
    });

    it('Step 9: order status should be DELIVERED', async () => {
      const order = await testPrisma.order.findUnique({
        where: { id: orderId },
      });
      expect(order?.status).toBe(OrderStatus.DELIVERED);
    });

    it('Step 10: driver should be available again', async () => {
      const driver = await testPrisma.driver.findUnique({
        where: { id: driverId },
      });
      expect(driver?.isAvailable).toBe(true);
      expect(driver?.ordersDelivered).toBe(6);
    });
  });

  // ============================================
  // Access Control
  // ============================================
  describe('Access Control', () => {
    it('non-admin cannot create delivery', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/deliveries/order/${orderId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(403);
    });

    it('non-admin cannot assign driver', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${deliveryId}/assign-driver`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ driverId })
        .expect(403);
    });

    it('non-driver cannot update status', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${deliveryId}/status?status=PICKING_UP`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(403);
    });

    it('admin can view all deliveries', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/deliveries')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ============================================
  // Driver deliveries list
  // ============================================
  describe('Driver deliveries', () => {
    it('driver can view own deliveries', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/deliveries/my')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });
});
