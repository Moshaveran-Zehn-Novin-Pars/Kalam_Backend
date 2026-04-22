import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UpdateBuyerDto } from './dto';

@Injectable()
export class BuyersService {
  private readonly logger = new Logger(BuyersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string) {
    const buyer = await this.prisma.buyer.findUnique({
      where: { userId },
      include: {
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

    if (!buyer) {
      throw new NotFoundException('پروفایل خریدار یافت نشد');
    }

    return buyer;
  }

  async updateProfile(userId: string, dto: UpdateBuyerDto) {
    const buyer = await this.prisma.buyer.findUnique({ where: { userId } });

    if (!buyer) {
      throw new NotFoundException('پروفایل خریدار یافت نشد');
    }

    const updated = await this.prisma.buyer.update({
      where: { userId },
      data: {
        ...(dto.businessName && { businessName: dto.businessName }),
        ...(dto.businessType && { businessType: dto.businessType }),
        ...(dto.economicCode !== undefined && {
          economicCode: dto.economicCode,
        }),
      },
    });

    this.logger.log(`Buyer profile updated: ${buyer.id}`);
    return updated;
  }
}
