import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { OrdersService } from '../orders.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  OrderStatus,
  PaymentMethod,
  UserRole,
  ProductStatus,
} from '@prisma/client';

const mockPrisma = {
  order: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  orderStatusHistory: {
    create: jest.fn(),
  },
  cart: {
    findUnique: jest.fn(),
  },
  cartItem: {
    deleteMany: jest.fn(),
  },
  address: {
    findFirst: jest.fn(),
  },
  product: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  farmer: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockOrder = {
  id: 'order-uuid-123',
  orderNumber: 'KLM-2026-00001',
  buyerId: 'user-uuid-123',
  addressId: 'addr-uuid-123',
  status: OrderStatus.PENDING_PAYMENT,
  subtotal: 9000000,
  deliveryFee: 500000,
  tax: 810000,
  total: 10310000,
  commissionTotal: 540000,
  paymentMethod: PaymentMethod.ONLINE_GATEWAY,
  requestedDeliveryAt: null,
  notes: null,
  cancelReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  items: [
    {
      id: 'item-uuid-123',
      orderId: 'order-uuid-123',
      productId: 'prod-uuid-123',
      farmerId: 'farmer-uuid-123',
      productName: 'سیب قرمز',
      quantity: { toNumber: () => 200 },
      unit: 'KG',
      pricePerUnit: 45000,
      subtotal: 9000000,
      commissionRate: 0.06,
      commission: 540000,
    },
  ],
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // findMyOrders
  // ============================================
  describe('findMyOrders()', () => {
    it('should return paginated orders', async () => {
      mockPrisma.order.findMany.mockResolvedValue([mockOrder]);
      mockPrisma.order.count.mockResolvedValue(1);

      const result = await service.findMyOrders('user-uuid-123', {
        page: 1,
        pageSize: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by status', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);

      await service.findMyOrders('user-uuid-123', {
        status: OrderStatus.CANCELLED,
      });

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: OrderStatus.CANCELLED,
          }),
        }),
      );
    });
  });

  // ============================================
  // findById
  // ============================================
  describe('findById()', () => {
    it('should return order for owner', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        address: {},
        payment: null,
        delivery: null,
        statusHistory: [],
      });

      const result = await service.findById(
        'user-uuid-123',
        'order-uuid-123',
        UserRole.BUYER,
      );

      expect(result.id).toBe('order-uuid-123');
    });

    it('should throw if order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.findById('user-uuid-123', 'non-existent', UserRole.BUYER),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        buyerId: 'other-user-id',
        address: {},
        payment: null,
        delivery: null,
        statusHistory: [],
      });

      await expect(
        service.findById('user-uuid-123', 'order-uuid-123', UserRole.BUYER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to see any order', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        buyerId: 'other-user-id',
        address: {},
        payment: null,
        delivery: null,
        statusHistory: [],
      });

      const result = await service.findById(
        'admin-uuid-123',
        'order-uuid-123',
        UserRole.ADMIN,
      );

      expect(result.id).toBe('order-uuid-123');
    });
  });

  // ============================================
  // createOrder
  // ============================================
  describe('createOrder()', () => {
    beforeEach(() => {
      mockPrisma.cart.findUnique.mockResolvedValue({
        id: 'cart-uuid-123',
        userId: 'user-uuid-123',
        items: [
          {
            id: 'item-uuid-123',
            productId: 'prod-uuid-123',
            quantity: { toNumber: () => 200 },
          },
        ],
      });

      mockPrisma.address.findFirst.mockResolvedValue({
        id: 'addr-uuid-123',
        userId: 'user-uuid-123',
      });

      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod-uuid-123',
        name: 'سیب قرمز',
        unit: 'KG',
        status: ProductStatus.ACTIVE,
        pricePerUnit: { toNumber: () => 45000 },
        stockQty: { toNumber: () => 5000 },
        reservedQty: { toNumber: () => 0 },
        farmer: {
          id: 'farmer-uuid-123',
          commissionRate: null,
        },
        category: {
          commissionRate: { toNumber: () => 0.06 },
        },
      });

      mockPrisma.order.create.mockResolvedValue(mockOrder);
      mockPrisma.product.update.mockResolvedValue({});
      mockPrisma.cartItem.deleteMany.mockResolvedValue({});
    });

    it('should create order successfully', async () => {
      const result = await service.createOrder('user-uuid-123', {
        addressId: 'addr-uuid-123',
        paymentMethod: PaymentMethod.ONLINE_GATEWAY,
      });

      expect(result.orderNumber).toBe('KLM-2026-00001');
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { reservedQty: { increment: 200 } },
        }),
      );
    });

    it('should throw if cart is empty', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrder('user-uuid-123', {
          addressId: 'addr-uuid-123',
          paymentMethod: PaymentMethod.ONLINE_GATEWAY,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if address not found', async () => {
      mockPrisma.address.findFirst.mockResolvedValue(null);

      await expect(
        service.createOrder('user-uuid-123', {
          addressId: 'non-existent',
          paymentMethod: PaymentMethod.ONLINE_GATEWAY,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if product insufficient stock', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod-uuid-123',
        name: 'سیب قرمز',
        unit: 'KG',
        status: ProductStatus.ACTIVE,
        pricePerUnit: { toNumber: () => 45000 },
        stockQty: { toNumber: () => 100 },
        reservedQty: { toNumber: () => 50 },
        farmer: { id: 'farmer-uuid-123', commissionRate: null },
        category: { commissionRate: { toNumber: () => 0.06 } },
      });

      await expect(
        service.createOrder('user-uuid-123', {
          addressId: 'addr-uuid-123',
          paymentMethod: PaymentMethod.ONLINE_GATEWAY,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // cancelOrder
  // ============================================
  describe('cancelOrder()', () => {
    beforeEach(() => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockPrisma.order.update.mockResolvedValue({});
      mockPrisma.orderStatusHistory.create.mockResolvedValue({});
      mockPrisma.product.update.mockResolvedValue({});
    });

    it('should cancel order successfully', async () => {
      const result = await service.cancelOrder(
        'user-uuid-123',
        'order-uuid-123',
        { reason: 'تغییر برنامه' },
        UserRole.BUYER,
      );

      expect(result.message).toBe('سفارش با موفقیت لغو شد');
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { reservedQty: { decrement: 200 } },
        }),
      );
    });

    it('should throw if order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelOrder(
          'user-uuid-123',
          'non-existent',
          {},
          UserRole.BUYER,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if order not cancellable', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.SHIPPING,
      });

      await expect(
        service.cancelOrder(
          'user-uuid-123',
          'order-uuid-123',
          {},
          UserRole.BUYER,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        buyerId: 'other-user-id',
      });

      await expect(
        service.cancelOrder(
          'user-uuid-123',
          'order-uuid-123',
          {},
          UserRole.BUYER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================
  // confirmOrder
  // ============================================
  describe('confirmOrder()', () => {
    beforeEach(() => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PAID_HELD,
      });
      mockPrisma.farmer.findUnique.mockResolvedValue({
        id: 'farmer-uuid-123',
        userId: 'user-uuid-123',
      });
      mockPrisma.order.update.mockResolvedValue({});
      mockPrisma.orderStatusHistory.create.mockResolvedValue({});
    });

    it('should confirm order successfully', async () => {
      const result = await service.confirmOrder(
        'user-uuid-123',
        'order-uuid-123',
      );

      expect(result.message).toBe('سفارش با موفقیت تأیید شد');
    });

    it('should throw if order not in PAID_HELD status', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PENDING_PAYMENT,
      });

      await expect(
        service.confirmOrder('user-uuid-123', 'order-uuid-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if user is not farmer', async () => {
      mockPrisma.farmer.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmOrder('user-uuid-123', 'order-uuid-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if farmer has no items in order', async () => {
      mockPrisma.farmer.findUnique.mockResolvedValue({
        id: 'other-farmer-id',
        userId: 'user-uuid-123',
      });

      await expect(
        service.confirmOrder('user-uuid-123', 'order-uuid-123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
