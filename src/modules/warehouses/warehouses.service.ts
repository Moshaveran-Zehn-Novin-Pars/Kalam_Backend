import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateWarehouseDto, ReserveWarehouseDto } from './dto';

@Injectable()
export class WarehousesService {
  private readonly logger = new Logger(WarehousesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Find all warehouses
  // ============================================
  async findAll(hasRefrigeration?: boolean) {
    return this.prisma.warehouse.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(hasRefrigeration !== undefined && { hasRefrigeration }),
      },
      orderBy: { availableKg: 'desc' },
    });
  }

  // ============================================
  // Find warehouse by ID
  // ============================================
  async findById(id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, isActive: true, deletedAt: null },
      include: {
        reservations: {
          where: { status: 'ACTIVE' },
          orderBy: { startDate: 'asc' },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException('سردخانه یافت نشد');
    }

    return warehouse;
  }

  // ============================================
  // Create warehouse (Admin)
  // ============================================
  async createWarehouse(dto: CreateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.create({
      data: {
        name: dto.name,
        address: dto.address,
        lat: dto.lat,
        lng: dto.lng,
        totalCapacityKg: dto.totalCapacityKg,
        availableKg: dto.totalCapacityKg,
        hasRefrigeration: dto.hasRefrigeration ?? false,
        tempMin: dto.tempMin,
        tempMax: dto.tempMax,
        pricePerKgPerDay: dto.pricePerKgPerDay,
        isActive: true,
      },
    });

    this.logger.log(`Warehouse created: ${warehouse.id}`);
    return warehouse;
  }

  // ============================================
  // Reserve warehouse space
  // ============================================
  async reserveSpace(
    userId: string,
    warehouseId: string,
    dto: ReserveWarehouseDto,
  ) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, isActive: true, deletedAt: null },
    });

    if (!warehouse) {
      throw new NotFoundException('سردخانه یافت نشد');
    }

    if (warehouse.availableKg < dto.quantityKg) {
      throw new BadRequestException(
        `ظرفیت کافی نیست. ظرفیت در دسترس: ${warehouse.availableKg} کیلوگرم`,
      );
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (endDate <= startDate) {
      throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد');
    }

    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    const totalPrice =
      dto.quantityKg * warehouse.pricePerKgPerDay.toNumber() * days;

    const reservation = await this.prisma.$transaction(async (tx) => {
      const res = await tx.warehouseReservation.create({
        data: {
          warehouseId,
          userId,
          quantityKg: dto.quantityKg,
          startDate,
          endDate,
          totalPrice,
          status: 'ACTIVE',
        },
      });

      await tx.warehouse.update({
        where: { id: warehouseId },
        data: { availableKg: { decrement: dto.quantityKg } },
      });

      return res;
    });

    this.logger.log(`Warehouse reserved: ${reservation.id}`);
    return reservation;
  }

  // ============================================
  // Get my reservations
  // ============================================
  async getMyReservations(userId: string) {
    return this.prisma.warehouseReservation.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        warehouse: {
          select: {
            name: true,
            address: true,
            hasRefrigeration: true,
            tempMin: true,
            tempMax: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ============================================
  // Cancel reservation
  // ============================================
  async cancelReservation(userId: string, reservationId: string) {
    const reservation = await this.prisma.warehouseReservation.findFirst({
      where: { id: reservationId, userId, status: 'ACTIVE' },
    });

    if (!reservation) {
      throw new NotFoundException('رزرو یافت نشد');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.warehouseReservation.update({
        where: { id: reservationId },
        data: { status: 'CANCELLED' },
      });

      await tx.warehouse.update({
        where: { id: reservation.warehouseId },
        data: { availableKg: { increment: reservation.quantityKg } },
      });
    });

    return { message: 'رزرو با موفقیت لغو شد' };
  }
}
