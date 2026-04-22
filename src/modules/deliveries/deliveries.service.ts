import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AssignDriverDto, UpdateLocationDto, ConfirmDeliveryDto } from './dto';
import { DeliveryStatus, OrderStatus } from '@prisma/client';

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);
  // private readonly BASE_DELIVERY_FEE = 500000;
  // private readonly FEE_PER_KM = 5000;

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Create delivery for order (Admin)
  // ============================================
  async createDelivery(orderId: string, adminId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { address: true, delivery: true },
    });
    adminId = 'Not Used';
    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }

    console.warn(adminId);

    if (order.status !== OrderStatus.CONFIRMED) {
      throw new BadRequestException('فقط سفارشات تأیید شده قابل ارسال هستند');
    }

    if (order.delivery) {
      throw new BadRequestException('این سفارش قبلاً حمل‌ونقل ایجاد شده است');
    }

    const delivery = await this.prisma.delivery.create({
      data: {
        orderId,
        status: DeliveryStatus.PENDING_ASSIGNMENT,
        pickupLat: 35.6892,
        pickupLng: 51.389,
        dropoffLat: order.address.lat.toNumber(),
        dropoffLng: order.address.lng.toNumber(),
        deliveryFee: order.deliveryFee.toNumber(),
      },
    });

    this.logger.log(`Delivery created for order: ${orderId}`);
    return delivery;
  }

  // ============================================
  // Get delivery by order ID
  // ============================================
  async getDeliveryByOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }

    if (order.buyerId !== userId) {
      throw new ForbiddenException('دسترسی غیرمجاز');
    }

    const delivery = await this.prisma.delivery.findUnique({
      where: { orderId },
      include: {
        driver: {
          select: {
            id: true,
            vehicleType: true,
            vehiclePlate: true,
            currentLat: true,
            currentLng: true,
            user: {
              select: { firstName: true, lastName: true, phone: true },
            },
          },
        },
        locations: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });

    if (!delivery) {
      throw new NotFoundException('اطلاعات ارسال یافت نشد');
    }

    return delivery;
  }

  // ============================================
  // Get my deliveries (Driver)
  // ============================================
  async getMyDeliveries(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException('پروفایل راننده یافت نشد');
    }

    return this.prisma.delivery.findMany({
      where: { driverId: driver.id },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            orderNumber: true,
            status: true,
            total: true,
            address: {
              select: {
                fullAddress: true,
                city: true,
                receiverName: true,
                receiverPhone: true,
              },
            },
          },
        },
      },
    });
  }

  // ============================================
  // Assign driver (Admin)
  // ============================================
  async assignDriver(deliveryId: string, dto: AssignDriverDto) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      throw new NotFoundException('حمل‌ونقل یافت نشد');
    }

    if (delivery.status !== DeliveryStatus.PENDING_ASSIGNMENT) {
      throw new BadRequestException('این حمل‌ونقل در انتظار تخصیص راننده نیست');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: dto.driverId },
    });

    if (!driver) {
      throw new NotFoundException('راننده یافت نشد');
    }

    if (!driver.isAvailable) {
      throw new BadRequestException('راننده در دسترس نیست');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedDelivery = await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          driverId: dto.driverId,
          status: DeliveryStatus.ASSIGNED,
          scheduledAt: new Date(),
        },
      });

      await tx.driver.update({
        where: { id: dto.driverId },
        data: { isAvailable: false },
      });

      return updatedDelivery;
    });

    this.logger.log(
      `Driver ${dto.driverId} assigned to delivery ${deliveryId}`,
    );
    return updated;
  }

  // ============================================
  // Update delivery status (Driver)
  // ============================================
  async updateStatus(
    deliveryId: string,
    userId: string,
    status: DeliveryStatus,
  ) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });

    if (!driver) {
      throw new ForbiddenException(
        'فقط رانندگان می‌توانند وضعیت را تغییر دهند',
      );
    }

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      throw new NotFoundException('حمل‌ونقل یافت نشد');
    }

    if (delivery.driverId !== driver.id) {
      throw new ForbiddenException('این حمل‌ونقل به شما تخصیص داده نشده');
    }

    // Validate status transition
    const validTransitions: Record<DeliveryStatus, DeliveryStatus[]> = {
      [DeliveryStatus.PENDING_ASSIGNMENT]: [],
      [DeliveryStatus.ASSIGNED]: [DeliveryStatus.PICKING_UP],
      [DeliveryStatus.PICKING_UP]: [DeliveryStatus.IN_TRANSIT],
      [DeliveryStatus.IN_TRANSIT]: [
        DeliveryStatus.DELIVERED,
        DeliveryStatus.FAILED,
      ],
      [DeliveryStatus.DELIVERED]: [],
      [DeliveryStatus.FAILED]: [],
    };

    if (!validTransitions[delivery.status].includes(status)) {
      throw new BadRequestException(
        `تغییر وضعیت از ${delivery.status} به ${status} مجاز نیست`,
      );
    }

    const updateData: Record<string, unknown> = { status };

    if (status === DeliveryStatus.PICKING_UP) {
      updateData.pickedUpAt = new Date();
    }

    if (status === DeliveryStatus.IN_TRANSIT) {
      // Update order status
      await this.prisma.order.update({
        where: { id: delivery.orderId },
        data: { status: OrderStatus.SHIPPING },
      });
    }

    return this.prisma.delivery.update({
      where: { id: deliveryId },
      data: updateData,
    });
  }

  // ============================================
  // Update driver location (Driver)
  // ============================================
  async updateLocation(
    deliveryId: string,
    userId: string,
    dto: UpdateLocationDto,
  ) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });

    if (!driver) {
      throw new ForbiddenException('دسترسی غیرمجاز');
    }

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery || delivery.driverId !== driver.id) {
      throw new ForbiddenException('این حمل‌ونقل به شما تخصیص داده نشده');
    }

    await this.prisma.$transaction(async (tx) => {
      // Save location history
      await tx.deliveryLocation.create({
        data: {
          deliveryId,
          lat: dto.lat,
          lng: dto.lng,
        },
      });

      // Update driver current location
      await tx.driver.update({
        where: { id: driver.id },
        data: { currentLat: dto.lat, currentLng: dto.lng },
      });
    });

    return { message: 'موقعیت با موفقیت بروزرسانی شد' };
  }

  // ============================================
  // Confirm delivery (Driver)
  // ============================================
  async confirmDelivery(
    deliveryId: string,
    userId: string,
    dto: ConfirmDeliveryDto,
  ) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });

    if (!driver) {
      throw new ForbiddenException('دسترسی غیرمجاز');
    }

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery || delivery.driverId !== driver.id) {
      throw new ForbiddenException('این حمل‌ونقل به شما تخصیص داده نشده');
    }

    if (delivery.status !== DeliveryStatus.IN_TRANSIT) {
      throw new BadRequestException('وضعیت حمل‌ونقل باید در مسیر باشد');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
          proofImage: dto.proofImage,
          signatureImage: dto.signatureImage,
          recipientName: dto.recipientName,
        },
      });

      await tx.order.update({
        where: { id: delivery.orderId },
        data: { status: OrderStatus.DELIVERED },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: delivery.orderId,
          status: OrderStatus.DELIVERED,
          changedBy: userId,
          reason: 'تحویل توسط راننده تأیید شد',
        },
      });

      await tx.driver.update({
        where: { id: driver.id },
        data: {
          isAvailable: true,
          ordersDelivered: { increment: 1 },
        },
      });
    });

    this.logger.log(`Delivery confirmed: ${deliveryId}`);
    return { message: 'تحویل با موفقیت تأیید شد' };
  }

  // ============================================
  // Get all deliveries (Admin)
  // ============================================
  async findAll(status?: DeliveryStatus) {
    return this.prisma.delivery.findMany({
      where: { ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
      include: {
        driver: {
          select: {
            id: true,
            vehicleType: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
        order: {
          select: {
            orderNumber: true,
            status: true,
            buyer: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
      },
    });
  }
}
