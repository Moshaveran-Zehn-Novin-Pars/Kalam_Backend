import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto';

@Injectable()
export class AddressesService {
  private readonly logger = new Logger(AddressesService.name);
  private readonly MAX_ADDRESSES = 10;

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Get all addresses for current user
  // ============================================
  async findAll(userId: string) {
    return this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  // ============================================
  // Get one address
  // ============================================
  async findOne(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, deletedAt: null },
    });

    if (!address) {
      throw new NotFoundException('آدرس یافت نشد');
    }

    if (address.userId !== userId) {
      throw new ForbiddenException('دسترسی غیرمجاز');
    }

    return address;
  }

  // ============================================
  // Create address
  // ============================================
  async create(userId: string, dto: CreateAddressDto) {
    // Check max addresses limit
    const count = await this.prisma.address.count({
      where: { userId, deletedAt: null },
    });

    if (count >= this.MAX_ADDRESSES) {
      throw new BadRequestException(
        `حداکثر ${this.MAX_ADDRESSES} آدرس می‌توانید داشته باشید`,
      );
    }

    // If this is the first address or isDefault is true, handle default
    const isFirstAddress = count === 0;
    const shouldBeDefault = dto.isDefault || isFirstAddress;

    // Remove default from other addresses if needed
    if (shouldBeDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
    }

    const address = await this.prisma.address.create({
      data: {
        userId,
        title: dto.title,
        fullAddress: dto.fullAddress,
        province: dto.province,
        city: dto.city,
        postalCode: dto.postalCode,
        lat: dto.lat,
        lng: dto.lng,
        receiverName: dto.receiverName,
        receiverPhone: dto.receiverPhone,
        isDefault: shouldBeDefault,
      },
    });

    this.logger.log(`Address created: ${address.id} for user: ${userId}`);
    return address;
  }

  // ============================================
  // Update address
  // ============================================
  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    const address = await this.findOne(userId, addressId);

    // Handle default change
    if (dto.isDefault === true && !address.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.address.update({
      where: { id: addressId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.fullAddress && { fullAddress: dto.fullAddress }),
        ...(dto.province && { province: dto.province }),
        ...(dto.city && { city: dto.city }),
        ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
        ...(dto.lat !== undefined && { lat: dto.lat }),
        ...(dto.lng !== undefined && { lng: dto.lng }),
        ...(dto.receiverName && { receiverName: dto.receiverName }),
        ...(dto.receiverPhone && { receiverPhone: dto.receiverPhone }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });

    return updated;
  }

  // ============================================
  // Set default address
  // ============================================
  async setDefault(userId: string, addressId: string) {
    await this.findOne(userId, addressId);

    await this.prisma.address.updateMany({
      where: { userId, isDefault: true, deletedAt: null },
      data: { isDefault: false },
    });

    await this.prisma.address.update({
      where: { id: addressId },
      data: { isDefault: true },
    });

    return { message: 'آدرس پیش‌فرض با موفقیت تنظیم شد' };
  }

  // ============================================
  // Delete address (soft delete)
  // ============================================
  async remove(userId: string, addressId: string) {
    const address = await this.findOne(userId, addressId);

    await this.prisma.address.update({
      where: { id: addressId },
      data: { deletedAt: new Date() },
    });

    // If deleted address was default, set another one as default
    if (address.isDefault) {
      const nextAddress = await this.prisma.address.findFirst({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });

      if (nextAddress) {
        await this.prisma.address.update({
          where: { id: nextAddress.id },
          data: { isDefault: true },
        });
      }
    }

    return { message: 'آدرس با موفقیت حذف شد' };
  }
}
