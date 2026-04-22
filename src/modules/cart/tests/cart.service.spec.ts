import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CartService } from '../cart.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ProductStatus } from '@prisma/client';

const mockPrisma = {
  cart: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  cartItem: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  product: {
    findFirst: jest.fn(),
  },
};

const mockProduct = {
  id: 'prod-uuid-123',
  name: 'سیب قرمز',
  unit: 'KG',
  pricePerUnit: { toNumber: () => 45000 },
  minOrderQty: { toNumber: () => 100 },
  maxOrderQty: null,
  stockQty: { toNumber: () => 5000 },
  reservedQty: { toNumber: () => 0 },
  status: ProductStatus.ACTIVE,
  requiresColdChain: false,
  farmer: { id: 'farmer-uuid-123', businessName: 'باغ سیب' },
  images: [],
};

const mockCart = {
  id: 'cart-uuid-123',
  userId: 'user-uuid-123',
  items: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CartService', () => {
  let service: CartService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // getCart
  // ============================================
  describe('getCart()', () => {
    it('should return empty cart if not exists', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue(null);

      const result = await service.getCart('user-uuid-123');

      expect(result.items).toHaveLength(0);
      expect(result.summary.totalAmount).toBe(0);
    });

    it('should return cart with items', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({
        ...mockCart,
        items: [
          {
            id: 'item-uuid-123',
            cartId: 'cart-uuid-123',
            productId: 'prod-uuid-123',
            quantity: { toNumber: () => 200 },
            addedAt: new Date(),
          },
        ],
      });
      mockPrisma.product.findFirst.mockResolvedValue(mockProduct);

      const result = await service.getCart('user-uuid-123');

      expect(result.items).toHaveLength(1);
      expect(result.summary.totalAmount).toBe(200 * 45000);
    });
  });

  // ============================================
  // addItem
  // ============================================
  describe('addItem()', () => {
    beforeEach(() => {
      mockPrisma.product.findFirst.mockResolvedValue(mockProduct);
      mockPrisma.cart.findUnique.mockResolvedValue({
        ...mockCart,
        items: [],
      });
      mockPrisma.cart.create.mockResolvedValue(mockCart);
      mockPrisma.cartItem.create.mockResolvedValue({});
    });

    it('should add item to cart successfully', async () => {
      mockPrisma.cart.findUnique
        .mockResolvedValueOnce({ ...mockCart, items: [] })
        .mockResolvedValueOnce({ ...mockCart, items: [] });

      await service.addItem('user-uuid-123', {
        productId: 'prod-uuid-123',
        quantity: 200,
      });

      expect(mockPrisma.cartItem.create).toHaveBeenCalled();
    });

    it('should throw if product not found', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.addItem('user-uuid-123', {
          productId: 'non-existent',
          quantity: 200,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if quantity less than MOQ', async () => {
      await expect(
        service.addItem('user-uuid-123', {
          productId: 'prod-uuid-123',
          quantity: 50, // less than minOrderQty (100)
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if insufficient stock', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        ...mockProduct,
        stockQty: { toNumber: () => 100 },
        reservedQty: { toNumber: () => 50 },
      });

      await expect(
        service.addItem('user-uuid-123', {
          productId: 'prod-uuid-123',
          quantity: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update quantity if item already in cart', async () => {
      const cartWithItem = {
        ...mockCart,
        items: [
          {
            id: 'item-uuid-123',
            cartId: 'cart-uuid-123',
            productId: 'prod-uuid-123',
            quantity: { toNumber: () => 200 },
          },
        ],
      };

      // اول برای getOrCreateCart، دوم برای getCart نهایی
      mockPrisma.cart.findUnique
        .mockResolvedValueOnce(cartWithItem)
        .mockResolvedValueOnce({ ...mockCart, items: [] });

      mockPrisma.cartItem.update.mockResolvedValue({});

      await service.addItem('user-uuid-123', {
        productId: 'prod-uuid-123',
        quantity: 300,
      });

      expect(mockPrisma.cartItem.update).toHaveBeenCalled();
    });
  });

  // ============================================
  // removeItem
  // ============================================
  describe('removeItem()', () => {
    it('should remove item successfully', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue(mockCart);
      mockPrisma.cartItem.findUnique.mockResolvedValue({
        id: 'item-uuid-123',
      });
      mockPrisma.cartItem.delete.mockResolvedValue({});
      mockPrisma.cart.findUnique.mockResolvedValueOnce({
        ...mockCart,
        items: [],
      });

      await service.removeItem('user-uuid-123', 'prod-uuid-123');

      expect(mockPrisma.cartItem.delete).toHaveBeenCalled();
    });

    it('should throw if cart not found', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue(null);

      await expect(
        service.removeItem('user-uuid-123', 'prod-uuid-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if item not in cart', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue(mockCart);
      mockPrisma.cartItem.findUnique.mockResolvedValue(null);

      await expect(
        service.removeItem('user-uuid-123', 'prod-uuid-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // clearCart
  // ============================================
  describe('clearCart()', () => {
    it('should clear cart successfully', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue(mockCart);
      mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.clearCart('user-uuid-123');

      expect(result.message).toBe('سبد خرید با موفقیت پاک شد');
    });

    it('should return message if cart not exists', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue(null);

      const result = await service.clearCart('user-uuid-123');

      expect(result.message).toBe('سبد خرید خالی است');
    });
  });
});
