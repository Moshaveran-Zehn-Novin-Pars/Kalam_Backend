import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import { ProductStatus } from '@prisma/client';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Get or create cart
  // ============================================
  private async getOrCreateCart(userId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            cart: false,
          },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId },
        include: { items: true },
      });
    }

    return cart;
  }

  // ============================================
  // Get cart with product details
  // ============================================
  async getCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            cart: false,
          },
        },
      },
    });

    if (!cart) {
      return {
        id: null,
        userId,
        items: [],
        summary: { itemCount: 0, totalAmount: 0 },
      };
    }

    // Get product details for each item
    const itemsWithProducts = await Promise.all(
      cart.items.map(async (item) => {
        const product = await this.prisma.product.findFirst({
          where: { id: item.productId, deletedAt: null },
          select: {
            id: true,
            name: true,
            slug: true,
            pricePerUnit: true,
            unit: true,
            minOrderQty: true,
            stockQty: true,
            reservedQty: true,
            status: true,
            requiresColdChain: true,
            farmer: {
              select: { id: true, businessName: true },
            },
            images: {
              where: { isPrimary: true },
              select: { url: true },
              take: 1,
            },
          },
        });

        const qty = item.quantity.toNumber();
        const price = product?.pricePerUnit.toNumber() ?? 0;
        const subtotal = qty * price;
        const availableStock = product
          ? product.stockQty.toNumber() - product.reservedQty.toNumber()
          : 0;

        return {
          productId: item.productId,
          quantity: qty,
          product,
          subtotal,
          isAvailable: product?.status === ProductStatus.ACTIVE,
          hasEnoughStock: availableStock >= qty,
          addedAt: item.addedAt,
        };
      }),
    );

    const totalAmount = itemsWithProducts.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );

    return {
      id: cart.id,
      userId,
      items: itemsWithProducts,
      summary: {
        itemCount: itemsWithProducts.length,
        totalAmount,
      },
    };
  }

  // ============================================
  // Add to cart
  // ============================================
  async addItem(userId: string, dto: AddToCartDto) {
    // Validate product
    const product = await this.prisma.product.findFirst({
      where: {
        id: dto.productId,
        deletedAt: null,
        status: ProductStatus.ACTIVE,
      },
    });

    if (!product) {
      throw new NotFoundException('محصول یافت نشد یا غیرفعال است');
    }

    // Check MOQ
    if (dto.quantity < product.minOrderQty.toNumber()) {
      throw new BadRequestException(
        `حداقل سفارش ${product.minOrderQty} ${product.unit} است`,
      );
    }

    // Check max order qty
    if (product.maxOrderQty && dto.quantity > product.maxOrderQty.toNumber()) {
      throw new BadRequestException(
        `حداکثر سفارش ${product.maxOrderQty} ${product.unit} است`,
      );
    }

    // Check available stock
    const availableStock =
      product.stockQty.toNumber() - product.reservedQty.toNumber();
    if (availableStock < dto.quantity) {
      throw new BadRequestException(
        `موجودی کافی نیست. موجودی در دسترس: ${availableStock} ${product.unit}`,
      );
    }

    const cart = await this.getOrCreateCart(userId);

    // Check if item already in cart
    const existingItem = cart.items.find(
      (item) => item.productId === dto.productId,
    );

    if (existingItem) {
      // Update quantity
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: dto.quantity },
      });
    } else {
      // Add new item
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          quantity: dto.quantity,
        },
      });
    }

    this.logger.log(`Item added to cart: ${dto.productId} for user: ${userId}`);
    return this.getCart(userId);
  }

  // ============================================
  // Update cart item
  // ============================================
  async updateItem(userId: string, productId: string, dto: UpdateCartItemDto) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });

    if (!cart) {
      throw new NotFoundException('سبد خرید یافت نشد');
    }

    const item = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
    });

    if (!item) {
      throw new NotFoundException('آیتم در سبد خرید یافت نشد');
    }

    // Validate quantity
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }

    if (dto.quantity < product.minOrderQty.toNumber()) {
      throw new BadRequestException(
        `حداقل سفارش ${product.minOrderQty} ${product.unit} است`,
      );
    }

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: dto.quantity },
    });

    return this.getCart(userId);
  }

  // ============================================
  // Remove item from cart
  // ============================================
  async removeItem(userId: string, productId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });

    if (!cart) {
      throw new NotFoundException('سبد خرید یافت نشد');
    }

    const item = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
    });

    if (!item) {
      throw new NotFoundException('آیتم در سبد خرید یافت نشد');
    }

    await this.prisma.cartItem.delete({ where: { id: item.id } });

    return this.getCart(userId);
  }

  // ============================================
  // Clear cart
  // ============================================
  async clearCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });

    if (!cart) {
      return { message: 'سبد خرید خالی است' };
    }

    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    return { message: 'سبد خرید با موفقیت پاک شد' };
  }
}
