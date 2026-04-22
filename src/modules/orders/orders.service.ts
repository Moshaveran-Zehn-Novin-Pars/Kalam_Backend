import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateOrderDto, QueryOrdersDto, CancelOrderDto } from './dto';
import { OrderStatus, UserRole, ProductStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly TAX_RATE = 0.09;
  private readonly DELIVERY_FEE = 500000;

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Generate order number
  // ============================================
  private generateOrderNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 99999)
      .toString()
      .padStart(5, '0');
    return `KLM-${year}-${random}`;
  }

  // ============================================
  // Get my orders
  // ============================================
  async findMyOrders(userId: string, query: QueryOrdersDto) {
    const { page = 1, pageSize = 10, status } = query;
    const skip = (page - 1) * pageSize;

    const where = {
      buyerId: userId,
      deletedAt: null,
      ...(status && { status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          subtotal: true,
          deliveryFee: true,
          tax: true,
          total: true,
          paymentMethod: true,
          requestedDeliveryAt: true,
          createdAt: true,
          items: {
            select: {
              productName: true,
              quantity: true,
              unit: true,
              pricePerUnit: true,
              subtotal: true,
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ============================================
  // Get order by ID
  // ============================================
  async findById(userId: string, orderId: string, userRole: UserRole) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        items: true,
        payment: true,
        delivery: true,
        address: true,
        statusHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }

    // Only admin or order owner can see
    if (userRole !== UserRole.ADMIN && order.buyerId !== userId) {
      throw new ForbiddenException('دسترسی غیرمجاز');
    }

    return order;
  }

  // ============================================
  // Create order from cart
  // ============================================
  async createOrder(userId: string, dto: CreateOrderDto) {
    // Get cart
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: true },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('سبد خرید خالی است');
    }

    // Validate address
    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId, deletedAt: null },
    });

    if (!address) {
      throw new NotFoundException('آدرس یافت نشد');
    }

    // Validate products and calculate totals
    let subtotal = 0;
    let commissionTotal = 0;

    const orderItems = await Promise.all(
      cart.items.map(async (item) => {
        const product = await this.prisma.product.findFirst({
          where: {
            id: item.productId,
            deletedAt: null,
            status: ProductStatus.ACTIVE,
          },
          include: {
            category: { select: { commissionRate: true } },
            farmer: { select: { id: true, commissionRate: true } },
          },
        });

        if (!product) {
          throw new BadRequestException(
            `محصول ${item.productId} یافت نشد یا غیرفعال است`,
          );
        }

        const qty = item.quantity.toNumber();
        const price = product.pricePerUnit.toNumber();
        const itemSubtotal = qty * price;

        // Available stock check
        const availableStock =
          product.stockQty.toNumber() - product.reservedQty.toNumber();
        if (availableStock < qty) {
          throw new BadRequestException(
            `موجودی محصول "${product.name}" کافی نیست`,
          );
        }

        // Commission rate (farmer override > category default)
        const commissionRate =
          product.farmer.commissionRate?.toNumber() ??
          product.category.commissionRate.toNumber();

        const commission = itemSubtotal * commissionRate;

        subtotal += itemSubtotal;
        commissionTotal += commission;

        return {
          productId: product.id,
          farmerId: product.farmer.id,
          productName: product.name,
          quantity: qty,
          unit: product.unit,
          pricePerUnit: price,
          subtotal: itemSubtotal,
          commissionRate,
          commission,
        };
      }),
    );

    const tax = subtotal * this.TAX_RATE;
    const total = subtotal + tax + this.DELIVERY_FEE;

    // Create order in transaction
    const order = await this.prisma.$transaction(async (tx) => {
      // Create order
      const newOrder = await tx.order.create({
        data: {
          orderNumber: this.generateOrderNumber(),
          buyerId: userId,
          addressId: dto.addressId,
          status: OrderStatus.PENDING_PAYMENT,
          subtotal,
          deliveryFee: this.DELIVERY_FEE,
          tax,
          total,
          commissionTotal,
          paymentMethod: dto.paymentMethod,
          requestedDeliveryAt: dto.requestedDeliveryAt
            ? new Date(dto.requestedDeliveryAt)
            : undefined,
          notes: dto.notes,
          items: {
            create: orderItems,
          },
          statusHistory: {
            create: {
              status: OrderStatus.PENDING_PAYMENT,
              reason: 'سفارش ایجاد شد',
            },
          },
        },
        include: {
          items: true,
          address: true,
        },
      });

      // Reserve stock for each product
      for (const item of orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { reservedQty: { increment: item.quantity } },
        });
      }

      // Clear cart
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return newOrder;
    });

    this.logger.log(`Order created: ${order.orderNumber} for user: ${userId}`);
    return order;
  }

  // ============================================
  // Cancel order
  // ============================================
  async cancelOrder(
    userId: string,
    orderId: string,
    dto: CancelOrderDto,
    userRole: UserRole,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }

    // Only buyer or admin can cancel
    if (userRole !== UserRole.ADMIN && order.buyerId !== userId) {
      throw new ForbiddenException('دسترسی غیرمجاز');
    }

    // Can only cancel in certain statuses
    const cancellableStatuses: OrderStatus[] = [
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.PAID_HELD,
      OrderStatus.CONFIRMED,
    ];

    if (!cancellableStatuses.includes(order.status)) {
      throw new BadRequestException('این سفارش قابل لغو نیست');
    }

    await this.prisma.$transaction(async (tx) => {
      // Update order status
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelReason: dto.reason,
        },
      });

      // Add status history
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: OrderStatus.CANCELLED,
          changedBy: userId,
          reason: dto.reason,
        },
      });

      // Release reserved stock
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            reservedQty: { decrement: item.quantity.toNumber() },
          },
        });
      }
    });

    this.logger.log(`Order cancelled: ${order.orderNumber}`);
    return { message: 'سفارش با موفقیت لغو شد' };
  }

  // ============================================
  // Confirm order (Farmer)
  // ============================================
  async confirmOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }

    if (order.status !== OrderStatus.PAID_HELD) {
      throw new BadRequestException('این سفارش در وضعیت قابل تأیید نیست');
    }

    // Check farmer owns at least one item
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
    });

    if (!farmer) {
      throw new ForbiddenException(
        'فقط باغداران می‌توانند سفارش را تأیید کنند',
      );
    }

    const hasItem = order.items.some((item) => item.farmerId === farmer.id);

    if (!hasItem) {
      throw new ForbiddenException('شما در این سفارش محصولی ندارید');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CONFIRMED },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: OrderStatus.CONFIRMED,
          changedBy: userId,
          reason: 'باغدار سفارش را تأیید کرد',
        },
      });
    });

    return { message: 'سفارش با موفقیت تأیید شد' };
  }

  // ============================================
  // Get all orders (Admin)
  // ============================================
  async findAllOrders(query: QueryOrdersDto) {
    const { page = 1, pageSize = 20, status } = query;
    const skip = (page - 1) * pageSize;

    const where = {
      deletedAt: null,
      ...(status && { status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }
}
