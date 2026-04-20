import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UpdateDriverDto } from './dto';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            avatar: true,
            kycStatus: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('پروفایل راننده یافت نشد');
    }

    return driver;
  }

  async updateStatus(userId: string, dto: UpdateDriverDto) {
    const driver = await this.prisma.driver.findUnique({ where: { userId } });

    if (!driver) {
      throw new NotFoundException('پروفایل راننده یافت نشد');
    }

    const updated = await this.prisma.driver.update({
      where: { userId },
      data: {
        ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
        ...(dto.currentLat !== undefined && { currentLat: dto.currentLat }),
        ...(dto.currentLng !== undefined && { currentLng: dto.currentLng }),
      },
    });

    this.logger.log(`Driver status updated: ${driver.id}`);
    return updated;
  }

  async findAvailable() {
    return this.prisma.driver.findMany({
      where: {
        isAvailable: true,
        deletedAt: null,
        user: { status: 'ACTIVE', deletedAt: null },
      },
      select: {
        id: true,
        vehicleType: true,
        capacityKg: true,
        hasRefrigeration: true,
        currentLat: true,
        currentLng: true,
        ratingAvg: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
  }
}
