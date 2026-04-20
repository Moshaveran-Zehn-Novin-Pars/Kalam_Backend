import {
  PrismaClient,
  UserRole,
  UserStatus,
  KycStatus,
  ProductStatus,
  QualityGrade,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  DeliveryStatus,
} from '@prisma/client';
import { faker } from '@faker-js/faker/locale/fa';

const prisma = new PrismaClient();

async function main() {
  process.stdout.write('🌱 Starting seed...\n');

  await cleanDatabase();
  const users = await seedUsers();
  const categories = await seedCategories();
  const products = await seedProducts(users.farmers, categories);
  await seedOrders(
    users.buyers,
    users.farmers,
    users.drivers,
    products,
    users.addresses,
  );

  process.stdout.write('\n✅ Seed completed successfully!\n');
  process.stdout.write(`
📊 Seeded:
  - ${users.admins.length} Admin(s)
  - ${users.farmers.length} Farmer(s)
  - ${users.buyers.length} Buyer(s)
  - ${users.drivers.length} Driver(s)
  - ${categories.length} Categories
  - ${products.length} Products
  - 5 Orders
  `);
}

// ============================================
// CLEAN
// ============================================
async function cleanDatabase() {
  process.stdout.write('🧹 Cleaning database...\n');

  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.review.deleteMany();
  await prisma.deliveryLocation.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.escrow.deleteMany();
  await prisma.walletTransaction.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.commissionRule.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.address.deleteMany();
  await prisma.farmer.deleteMany();
  await prisma.buyer.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.warehouseReservation.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.category.deleteMany();
}

// ============================================
// USERS
// ============================================
async function seedUsers() {
  process.stdout.write('👥 Seeding users...\n');

  // Admin
  const adminUser = await prisma.user.create({
    data: {
      phone: '09100000001',
      firstName: 'علی',
      lastName: 'مدیر',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.APPROVED,
      nationalCode: '0012345678',
    },
  });

  // Support
  const supportUser = await prisma.user.create({
    data: {
      phone: '09100000002',
      firstName: 'سارا',
      lastName: 'پشتیبان',
      role: UserRole.SUPPORT,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.APPROVED,
      nationalCode: '0012345679',
    },
  });

  // Farmers
  const farmerUsers = await Promise.all([
    createFarmer({
      phone: '09111111111',
      firstName: 'محمد',
      lastName: 'باغدار',
      nationalCode: '1234567890',
      businessName: 'باغ سیب طلایی',
      farmLocation: 'اصفهان، شهرضا',
      farmLat: 31.9244,
      farmLng: 51.8678,
    }),
    createFarmer({
      phone: '09111111112',
      firstName: 'حسن',
      lastName: 'کشاورز',
      nationalCode: '1234567891',
      businessName: 'مزرعه گوجه سبز',
      farmLocation: 'تهران، ورامین',
      farmLat: 35.3219,
      farmLng: 51.6517,
    }),
    createFarmer({
      phone: '09111111113',
      firstName: 'فاطمه',
      lastName: 'رضایی',
      nationalCode: '1234567892',
      businessName: 'باغبانی نوین',
      farmLocation: 'شیراز، مرودشت',
      farmLat: 29.8378,
      farmLng: 52.8017,
    }),
  ]);

  // Buyers
  const buyerUsers = await Promise.all([
    createBuyer({
      phone: '09222222221',
      firstName: 'رضا',
      lastName: 'خریدار',
      nationalCode: '2234567890',
      businessName: 'سوپرمارکت ستاره',
      businessType: 'SUPERMARKET',
    }),
    createBuyer({
      phone: '09222222222',
      firstName: 'مریم',
      lastName: 'احمدی',
      nationalCode: '2234567891',
      businessName: 'رستوران سبز',
      businessType: 'RESTAURANT',
    }),
    createBuyer({
      phone: '09222222223',
      firstName: 'کریم',
      lastName: 'محمدی',
      nationalCode: '2234567892',
      businessName: 'هتل پارسیان',
      businessType: 'HOTEL',
    }),
  ]);

  // Drivers
  const driverUsers = await Promise.all([
    createDriver({
      phone: '09333333331',
      firstName: 'احمد',
      lastName: 'راننده',
      nationalCode: '3234567890',
      vehicleType: 'REFRIGERATED_TRUCK',
      vehiclePlate: '12ایران345',
      capacityKg: 5000,
      hasRefrigeration: true,
    }),
    createDriver({
      phone: '09333333332',
      firstName: 'علیرضا',
      lastName: 'تهرانی',
      nationalCode: '3234567891',
      vehicleType: 'VAN',
      vehiclePlate: '34ایران567',
      capacityKg: 1000,
      hasRefrigeration: false,
    }),
  ]);

  // Addresses for buyers
  const addresses = await Promise.all(
    buyerUsers.map((b) =>
      prisma.address.create({
        data: {
          userId: b.userId,
          title: 'انبار اصلی',
          fullAddress: faker.location.streetAddress(),
          province: 'تهران',
          city: 'تهران',
          postalCode: '1234567890',
          lat: 35.6892 + Math.random() * 0.1,
          lng: 51.389 + Math.random() * 0.1,
          receiverName: b.firstName + ' ' + b.lastName,
          receiverPhone: b.phone,
          isDefault: true,
        },
      }),
    ),
  );

  // Wallets for all users
  const allUsers = [
    adminUser,
    supportUser,
    ...farmerUsers.map((f) => f),
    ...buyerUsers.map((b) => b),
    ...driverUsers.map((d) => d),
  ];

  await Promise.all(
    allUsers.map((u) =>
      prisma.wallet.create({
        data: {
          userId: u.id ?? u.id,
          balance: Math.floor(Math.random() * 10000000),
          currency: 'IRR',
        },
      }),
    ),
  );

  return {
    admins: [adminUser],
    support: [supportUser],
    farmers: farmerUsers,
    buyers: buyerUsers,
    drivers: driverUsers,
    addresses,
  };
}

interface FarmerResult {
  farmerId: string;
  farmLat: number;
  farmLng: number;
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  status: UserStatus;
  kycStatus: KycStatus;
}

async function createFarmer(data: {
  phone: string;
  firstName: string;
  lastName: string;
  nationalCode: string;
  businessName: string;
  farmLocation: string;
  farmLat: number;
  farmLng: number;
}): Promise<FarmerResult> {
  const user = await prisma.user.create({
    data: {
      phone: data.phone,
      firstName: data.firstName,
      lastName: data.lastName,
      role: UserRole.FARMER,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.APPROVED,
      nationalCode: data.nationalCode,
    },
  });

  const farmer = await prisma.farmer.create({
    data: {
      userId: user.id,
      businessName: data.businessName,
      farmLocation: data.farmLocation,
      farmLat: data.farmLat,
      farmLng: data.farmLng,
      iban: 'IR' + Math.random().toString().slice(2, 26),
      ratingAvg: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
      ratingCount: Math.floor(Math.random() * 100) + 10,
      verifiedAt: new Date(),
    },
  });

  return {
    id: user.id,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    kycStatus: user.kycStatus,
    farmerId: farmer.id,
    farmLat: data.farmLat,
    farmLng: data.farmLng,
  };
}

async function createBuyer(data: {
  phone: string;
  firstName: string;
  lastName: string;
  nationalCode: string;
  businessName: string;
  businessType: string;
}) {
  const user = await prisma.user.create({
    data: {
      phone: data.phone,
      firstName: data.firstName,
      lastName: data.lastName,
      role: UserRole.BUYER,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.APPROVED,
      nationalCode: data.nationalCode,
    },
  });

  await prisma.buyer.create({
    data: {
      userId: user.id,
      businessName: data.businessName,
      businessType: data.businessType,
      creditLimit: 50000000,
      verifiedAt: new Date(),
    },
  });

  return { ...user, userId: user.id };
}

async function createDriver(data: {
  phone: string;
  firstName: string;
  lastName: string;
  nationalCode: string;
  vehicleType: string;
  vehiclePlate: string;
  capacityKg: number;
  hasRefrigeration: boolean;
}) {
  const user = await prisma.user.create({
    data: {
      phone: data.phone,
      firstName: data.firstName,
      lastName: data.lastName,
      role: UserRole.DRIVER,
      status: UserStatus.ACTIVE,
      kycStatus: KycStatus.APPROVED,
      nationalCode: data.nationalCode,
    },
  });

  const driver = await prisma.driver.create({
    data: {
      userId: user.id,
      vehicleType: data.vehicleType,
      vehiclePlate: data.vehiclePlate,
      capacityKg: data.capacityKg,
      hasRefrigeration: data.hasRefrigeration,
      licenseNumber: 'DL' + Math.random().toString().slice(2, 12),
      licenseExpiresAt: new Date('2027-01-01'),
      ratingAvg: Math.round((4 + Math.random()) * 10) / 10,
      ratingCount: Math.floor(Math.random() * 50) + 5,
      isAvailable: true,
    },
  });

  return { ...user, driverId: driver.id };
}

// ============================================
// CATEGORIES
// ============================================
async function seedCategories() {
  process.stdout.write('📂 Seeding categories...\n');

  const parentCategories = await Promise.all([
    prisma.category.create({
      data: {
        name: 'میوه‌جات',
        slug: 'fruits',
        commissionRate: 0.06,
        isActive: true,
        order: 1,
      },
    }),
    prisma.category.create({
      data: {
        name: 'سبزیجات',
        slug: 'vegetables',
        commissionRate: 0.05,
        isActive: true,
        order: 2,
      },
    }),
    prisma.category.create({
      data: {
        name: 'صیفی‌جات',
        slug: 'summer-crops',
        commissionRate: 0.06,
        isActive: true,
        order: 3,
      },
    }),
  ]);

  const subCategories = await Promise.all([
    // میوه‌جات
    prisma.category.create({
      data: {
        name: 'سیب',
        slug: 'apple',
        parentId: parentCategories[0].id,
        commissionRate: 0.06,
        isActive: true,
        order: 1,
      },
    }),
    prisma.category.create({
      data: {
        name: 'پرتقال',
        slug: 'orange',
        parentId: parentCategories[0].id,
        commissionRate: 0.06,
        isActive: true,
        order: 2,
      },
    }),
    prisma.category.create({
      data: {
        name: 'انگور',
        slug: 'grape',
        parentId: parentCategories[0].id,
        commissionRate: 0.07,
        isActive: true,
        order: 3,
      },
    }),
    // سبزیجات
    prisma.category.create({
      data: {
        name: 'گوجه فرنگی',
        slug: 'tomato',
        parentId: parentCategories[1].id,
        commissionRate: 0.05,
        isActive: true,
        order: 1,
      },
    }),
    prisma.category.create({
      data: {
        name: 'خیار',
        slug: 'cucumber',
        parentId: parentCategories[1].id,
        commissionRate: 0.05,
        isActive: true,
        order: 2,
      },
    }),
    // صیفی‌جات
    prisma.category.create({
      data: {
        name: 'هندوانه',
        slug: 'watermelon',
        parentId: parentCategories[2].id,
        commissionRate: 0.06,
        isActive: true,
        order: 1,
      },
    }),
  ]);

  return [...parentCategories, ...subCategories];
}

// ============================================
// PRODUCTS
// ============================================
async function seedProducts(
  farmers: Awaited<ReturnType<typeof createFarmer>>[],
  categories: Awaited<ReturnType<typeof seedCategories>>,
) {
  process.stdout.write('📦 Seeding products...\n');

  const subCategories = categories.filter((c) => c.parentId !== null);

  const productsData = [
    {
      name: 'سیب قرمز درجه یک',
      slug: 'red-apple-grade-a',
      categorySlug: 'apple',
      origin: 'اصفهان، شهرضا',
      qualityGrade: QualityGrade.A,
      pricePerUnit: 45000,
      minOrderQty: 100,
      stockQty: 5000,
      unit: 'KG',
      farmerIndex: 0,
    },
    {
      name: 'پرتقال تامسون',
      slug: 'thomson-orange',
      categorySlug: 'orange',
      origin: 'مازندران، آمل',
      qualityGrade: QualityGrade.A,
      pricePerUnit: 38000,
      minOrderQty: 200,
      stockQty: 8000,
      unit: 'KG',
      farmerIndex: 0,
    },
    {
      name: 'انگور قرمز بیدانه',
      slug: 'red-seedless-grape',
      categorySlug: 'grape',
      origin: 'فارس، شیراز',
      qualityGrade: QualityGrade.B,
      pricePerUnit: 85000,
      minOrderQty: 50,
      stockQty: 2000,
      unit: 'KG',
      farmerIndex: 2,
    },
    {
      name: 'گوجه فرنگی گلخانه‌ای',
      slug: 'greenhouse-tomato',
      categorySlug: 'tomato',
      origin: 'تهران، ورامین',
      qualityGrade: QualityGrade.A,
      pricePerUnit: 28000,
      minOrderQty: 100,
      stockQty: 10000,
      unit: 'KG',
      farmerIndex: 1,
    },
    {
      name: 'خیار سبز درجه یک',
      slug: 'green-cucumber-grade-a',
      categorySlug: 'cucumber',
      origin: 'اصفهان',
      qualityGrade: QualityGrade.A,
      pricePerUnit: 22000,
      minOrderQty: 200,
      stockQty: 15000,
      unit: 'KG',
      farmerIndex: 1,
    },
    {
      name: 'هندوانه شب چره',
      slug: 'shabchare-watermelon',
      categorySlug: 'watermelon',
      origin: 'خراسان، نیشابور',
      qualityGrade: QualityGrade.B,
      pricePerUnit: 15000,
      minOrderQty: 500,
      stockQty: 20000,
      unit: 'KG',
      farmerIndex: 2,
    },
  ];

  const products = await Promise.all(
    productsData.map(async (p) => {
      const category = subCategories.find((c) => c.slug === p.categorySlug)!;
      const farmer = farmers[p.farmerIndex];

      const product = await prisma.product.create({
        data: {
          farmerId: farmer.farmerId,
          categoryId: category.id,
          name: p.name,
          slug: p.slug,
          origin: p.origin,
          qualityGrade: p.qualityGrade,
          pricePerUnit: p.pricePerUnit,
          minOrderQty: p.minOrderQty,
          maxOrderQty: p.minOrderQty * 20,
          stockQty: p.stockQty,
          unit: p.unit,
          status: ProductStatus.ACTIVE,
          shelfLifeDays: 14,
          harvestDate: new Date(),
        },
      });

      // Product images
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: `https://picsum.photos/seed/${p.slug}/800/600`,
          isPrimary: true,
          order: 0,
        },
      });

      // Price history
      await prisma.priceHistory.create({
        data: {
          productId: product.id,
          pricePerUnit: p.pricePerUnit * 0.9,
          recordedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      });

      return product;
    }),
  );

  return products;
}

// ============================================
// ORDERS
// ============================================
async function seedOrders(
  buyers: Awaited<ReturnType<typeof createBuyer>>[],
  farmers: Awaited<ReturnType<typeof createFarmer>>[],
  drivers: Awaited<ReturnType<typeof createDriver>>[],
  products: Awaited<ReturnType<typeof seedProducts>>,
  addresses: Awaited<ReturnType<typeof prisma.address.findFirst>>[],
) {
  process.stdout.write('📋 Seeding orders...\n');

  const orderStatuses = [
    OrderStatus.COMPLETED,
    OrderStatus.SHIPPING,
    OrderStatus.CONFIRMED,
    OrderStatus.PENDING_PAYMENT,
    OrderStatus.CANCELLED,
  ];

  await Promise.all(
    orderStatuses.map(async (status, i) => {
      const buyer = buyers[i % buyers.length];
      const address = addresses[i % addresses.length];
      const product = products[i % products.length];
      const farmer = farmers[0];
      const qty = product.minOrderQty.toNumber() * (1 + i);
      const price = product.pricePerUnit.toNumber();
      const subtotal = qty * price;
      const commissionRate = 0.06;
      const commission = subtotal * commissionRate;
      const tax = subtotal * 0.09;
      const deliveryFee = 500000;
      const total = subtotal + tax + deliveryFee;

      const order = await prisma.order.create({
        data: {
          orderNumber: `KLM-2026-${String(i + 1).padStart(5, '0')}`,
          buyerId: buyer.id,
          addressId: address!.id,
          status,
          subtotal,
          deliveryFee,
          tax,
          total,
          commissionTotal: commission,
          paymentMethod: PaymentMethod.ONLINE_GATEWAY,
          requestedDeliveryAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          items: {
            create: {
              productId: product.id,
              farmerId: farmer.farmerId,
              productName: product.name,
              quantity: qty,
              unit: product.unit,
              pricePerUnit: price,
              subtotal,
              commissionRate,
              commission,
            },
          },
          statusHistory: {
            create: {
              status: OrderStatus.PENDING_PAYMENT,
              reason: 'Order created',
            },
          },
        },
      });

      // Payment for non-pending orders
      if (status !== OrderStatus.PENDING_PAYMENT) {
        await prisma.payment.create({
          data: {
            orderId: order.id,
            method: PaymentMethod.ONLINE_GATEWAY,
            amount: total,
            status: PaymentStatus.SUCCESS,
            gateway: 'ZARINPAL',
            gatewayRef:
              'ZP-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
            paidAt: new Date(),
          },
        });

        // Escrow
        await prisma.escrow.create({
          data: {
            orderId: order.id,
            amount: subtotal,
            status: status === OrderStatus.COMPLETED ? 'RELEASED' : 'HELD',
            releasedAt: status === OrderStatus.COMPLETED ? new Date() : null,
          },
        });
      }

      // Delivery for shipping/completed orders
      if (status === OrderStatus.SHIPPING || status === OrderStatus.COMPLETED) {
        const driver = drivers[0];
        await prisma.delivery.create({
          data: {
            orderId: order.id,
            driverId: driver.driverId,
            status:
              status === OrderStatus.COMPLETED
                ? DeliveryStatus.DELIVERED
                : DeliveryStatus.IN_TRANSIT,
            pickupLat: farmer.farmLat ?? 35.6892,
            pickupLng: farmer.farmLng ?? 51.389,
            dropoffLat: address!.lat.toNumber(),
            dropoffLng: address!.lng.toNumber(),
            distanceKm: Math.floor(Math.random() * 100) + 10,
            deliveryFee,
            scheduledAt: new Date(),
            pickedUpAt: new Date(),
            deliveredAt: status === OrderStatus.COMPLETED ? new Date() : null,
          },
        });
      }

      // Invoice for completed orders
      if (status === OrderStatus.COMPLETED) {
        await prisma.invoice.create({
          data: {
            orderId: order.id,
            invoiceNumber: `INV-2026-${String(i + 1).padStart(5, '0')}`,
            totalAmount: total,
            taxAmount: tax,
          },
        });

        // Review
        await prisma.review.create({
          data: {
            orderId: order.id,
            authorId: buyer.id,
            targetId: farmer.id,
            rating: Math.floor(Math.random() * 2) + 4,
            comment: 'محصول با کیفیت و تحویل به موقع',
            type: 'BUYER_REVIEWS_FARMER',
          },
        });
      }
    }),
  );
}

// ============================================
// RUN
// ============================================
main()
  .catch((e) => {
    process.stderr.write(String(e) + '\n');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
