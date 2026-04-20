import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UpdateFarmerDto, QueryFarmersDto } from './dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class FarmersService {
  private readonly logger = new Logger(FarmersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Get all farmers (public/buyer)
  // ============================================
  async findAll(query: QueryFarmersDto) {
    const { page = 1, pageSize = 10, search } = query;
    const skip = (page - 1) * pageSize;

    const where = {
      deletedAt: null,
      user: {
        status: 'ACTIVE' as const,
        role: UserRole.FARMER,
        deletedAt: null,
      },
      ...(search && {
        OR: [
          { businessName: { contains: search } },
          { farmLocation: { contains: search } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.farmer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { ratingAvg: 'desc' },
        select: {
          id: true,
          businessName: true,
          farmLocation: true,
          ratingAvg: true,
          ratingCount: true,
          totalSales: true,
          verifiedAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
      }),
      this.prisma.farmer.count({ where }),
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
  // Get farmer by ID (public)
  // ============================================
  async findById(farmerId: string) {
    const farmer = await this.prisma.farmer.findFirst({
      where: { id: farmerId, deletedAt: null },
      select: {
        id: true,
        businessName: true,
        description: true,
        farmLocation: true,
        farmLat: true,
        farmLng: true,
        ratingAvg: true,
        ratingCount: true,
        totalSales: true,
        verifiedAt: true,
        certificates: {
          where: { verified: true },
          select: {
            id: true,
            type: true,
            imageUrl: true,
            issuedAt: true,
            expiresAt: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            createdAt: true,
          },
        },
      },
    });

    if (!farmer) {
      throw new NotFoundException('باغدار یافت نشد');
    }

    return farmer;
  }

  // ============================================
  // Get my farmer profile
  // ============================================
  async getMyProfile(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
      include: {
        certificates: true,
        user: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            kycStatus: true,
          },
        },
      },
    });

    if (!farmer) {
      throw new NotFoundException('پروفایل باغدار یافت نشد');
    }

    return farmer;
  }

  // ============================================
  // Update farmer profile
  // ============================================
  async updateProfile(userId: string, dto: UpdateFarmerDto) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
    });

    if (!farmer) {
      throw new NotFoundException('پروفایل باغدار یافت نشد');
    }

    const updated = await this.prisma.farmer.update({
      where: { userId },
      data: {
        ...(dto.businessName && { businessName: dto.businessName }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.farmLocation !== undefined && {
          farmLocation: dto.farmLocation,
        }),
        ...(dto.farmLat !== undefined && { farmLat: dto.farmLat }),
        ...(dto.farmLng !== undefined && { farmLng: dto.farmLng }),
        ...(dto.iban !== undefined && { iban: dto.iban }),
      },
    });

    this.logger.log(`Farmer profile updated: ${farmer.id}`);
    return updated;
  }

  // ============================================
  // Verify farmer (Admin)
  // ============================================
  async verifyFarmer(farmerId: string) {
    const farmer = await this.prisma.farmer.findFirst({
      where: { id: farmerId, deletedAt: null },
    });

    if (!farmer) {
      throw new NotFoundException('باغدار یافت نشد');
    }

    const updated = await this.prisma.farmer.update({
      where: { id: farmerId },
      data: { verifiedAt: new Date() },
    });

    this.logger.log(`Farmer verified: ${farmerId}`);
    return updated;
  }

  // ============================================
  // Check if user is farmer
  // ============================================
  async checkIsFarmer(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || user.role !== UserRole.FARMER) {
      throw new ForbiddenException('این عملیات فقط برای باغداران مجاز است');
    }
  }
}
