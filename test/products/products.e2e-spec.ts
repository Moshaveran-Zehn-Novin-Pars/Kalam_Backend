import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, testPrisma } from '../utils';
import {
  UserRole,
  UserStatus,
  ProductStatus,
  QualityGrade,
} from '@prisma/client';
import * as crypto from 'crypto';
import { RedisService } from '../../src/infrastructure/redis/redis.service';

const PRODUCT_TEST_PHONES = ['09188888881', '09188888882', '09188888883'];

async function cleanProductTestData() {
  const users = await testPrisma.user.findMany({
    where: { phone: { in: PRODUCT_TEST_PHONES } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    const farmers = await testPrisma.farmer.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const farmerIds = farmers.map((f) => f.id);

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
      await testPrisma.farmer.deleteMany({ where: { id: { in: farmerIds } } });
    }

    await testPrisma.category.deleteMany({
      where: { slug: { in: ['test-fruits-e2e', 'test-apple-e2e'] } },
    });
    await testPrisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await testPrisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
    await testPrisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await testPrisma.otpCode.deleteMany({
    where: { phone: { in: PRODUCT_TEST_PHONES } },
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

describe('Products & Categories (e2e)', () => {
  let app: INestApplication;
  let farmerToken: string;
  let adminToken: string;
  let buyerToken: string;
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    await cleanProductTestData();
    app = await createTestApp();

    // Create users
    const farmerUser = await testPrisma.user.create({
      data: {
        phone: '09188888881',
        role: UserRole.FARMER,
        status: UserStatus.ACTIVE,
        nationalCode: '8888888881',
        firstName: 'محمد',
        lastName: 'باغدار',
      },
    });

    await testPrisma.farmer.create({
      data: {
        userId: farmerUser.id,
        businessName: 'باغ تست',
        ratingAvg: 4.5,
        ratingCount: 5,
        totalSales: 0,
      },
    });

    const adminUser = await testPrisma.user.create({
      data: {
        phone: '09188888882',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        nationalCode: '8888888882',
      },
    });

    const buyerUser = await testPrisma.user.create({
      data: {
        phone: '09188888883',
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
        nationalCode: '8888888883',
      },
    });

    farmerToken = await getToken(app, farmerUser.phone);
    adminToken = await getToken(app, adminUser.phone);
    buyerToken = await getToken(app, buyerUser.phone);
  });

  afterAll(async () => {
    await cleanProductTestData();
    await app.close();
  });

  // ============================================
  // Categories
  // ============================================
  describe('Categories', () => {
    it('GET /categories - should return categories without auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /categories - should create category as admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'میوه‌جات تست',
          slug: 'test-fruits-e2e',
          commissionRate: 0.06,
          order: 99,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('test-fruits-e2e');
      categoryId = res.body.data.id;
    });

    it('POST /categories - should reject duplicate slug', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'test', slug: 'test-fruits-e2e' })
        .expect(409);

      expect(res.body.success).toBe(false);
    });

    it('POST /categories - should reject non-admin', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({ name: 'test', slug: 'test-slug' })
        .expect(403);
    });

    it('GET /categories/:id - should return category', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/categories/${categoryId}`)
        .expect(200);

      expect(res.body.data.id).toBe(categoryId);
    });

    it('GET /categories/test-fruits-e2e - should find by slug', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/categories/test-fruits-e2e')
        .expect(200);

      expect(res.body.data.slug).toBe('test-fruits-e2e');
    });

    it('PATCH /categories/:id - should update category', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'میوه‌جات تست ویرایش شده' })
        .expect(200);

      expect(res.body.data.name).toBe('میوه‌جات تست ویرایش شده');
    });
  });

  // ============================================
  // Products
  // ============================================
  describe('Products', () => {
    it('GET /products - should return products without auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.meta).toBeDefined();
    });

    it('POST /products - should create product as farmer', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({
          categoryId,
          name: 'سیب قرمز تست',
          slug: `red-apple-test-${Date.now()}`,
          qualityGrade: QualityGrade.A,
          unit: 'KG',
          pricePerUnit: 45000,
          minOrderQty: 100,
          stockQty: 5000,
          origin: 'اصفهان',
          shelfLifeDays: 14,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(ProductStatus.DRAFT);
      productId = res.body.data.id;
    });

    it('POST /products - should reject buyer', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          categoryId,
          name: 'test',
          slug: 'test-slug',
          qualityGrade: QualityGrade.A,
          unit: 'KG',
          pricePerUnit: 1000,
          minOrderQty: 10,
          stockQty: 100,
        })
        .expect(403);
    });

    it('GET /products/:id - should return product', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}`)
        .expect(200);

      expect(res.body.data.id).toBe(productId);
    });

    it('PATCH /products/:id/approve - should approve product as admin', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.status).toBe(ProductStatus.ACTIVE);
    });

    it('PATCH /products/:id - should update product as owner farmer', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({ pricePerUnit: 50000, name: 'سیب قرمز تست ویرایش' })
        .expect(200);

      expect(res.body.data.name).toBe('سیب قرمز تست ویرایش');
    });

    it('GET /products - should filter by qualityGrade', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/products?qualityGrade=${QualityGrade.A}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('GET /products - should search by name', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products?search=سیب')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('GET /products/my - should return farmer own products', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products/my')
        .set('Authorization', `Bearer ${farmerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Scenario: Full Product Lifecycle
  // ============================================
  describe('Scenario: Full Product Lifecycle', () => {
    let lifecycleProductId: string;
    const uniqueSlug = `lifecycle-product-${Date.now()}`;

    it('Step 1: farmer creates product (DRAFT)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({
          categoryId,
          name: 'محصول چرخه کامل',
          slug: uniqueSlug,
          qualityGrade: QualityGrade.B,
          unit: 'KG',
          pricePerUnit: 30000,
          minOrderQty: 200,
          stockQty: 10000,
        })
        .expect(201);

      lifecycleProductId = res.body.data.id;
      expect(res.body.data.status).toBe(ProductStatus.DRAFT);
    });

    it('Step 2: admin approves product (ACTIVE)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${lifecycleProductId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.status).toBe(ProductStatus.ACTIVE);
    });

    it('Step 3: buyer can see active product', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/products/${lifecycleProductId}`)
        .expect(200);

      expect(res.body.data.status).toBe(ProductStatus.ACTIVE);
    });

    it('Step 4: farmer updates price', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${lifecycleProductId}`)
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({ pricePerUnit: 35000 })
        .expect(200);

      expect(parseFloat(res.body.data.pricePerUnit)).toBe(35000);
    });

    it('Step 5: farmer deletes product', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/products/${lifecycleProductId}`)
        .set('Authorization', `Bearer ${farmerToken}`)
        .expect(200);

      expect(res.body.data.message).toBe('محصول با موفقیت حذف شد');
    });

    it('Step 6: deleted product not found', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/products/${lifecycleProductId}`)
        .expect(404);
    });
  });
});
