import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateReviewDto, QueryReviewsDto, ReviewType } from './dto';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Create review
  // ============================================
  async createReview(authorId: string, dto: CreateReviewDto) {
    // Check order exists and is completed
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, deletedAt: null },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }

    if (
      order.status !== OrderStatus.COMPLETED &&
      order.status !== OrderStatus.DELIVERED
    ) {
      throw new BadRequestException(
        'فقط سفارشات تحویل داده شده قابل امتیازدهی هستند',
      );
    }

    // Check author is part of this order
    if (dto.type === ReviewType.BUYER_REVIEWS_FARMER) {
      if (order.buyerId !== authorId) {
        throw new ForbiddenException('شما خریدار این سفارش نیستید');
      }
    } else {
      const farmer = await this.prisma.farmer.findUnique({
        where: { userId: authorId },
      });
      if (!farmer) {
        throw new ForbiddenException(
          'فقط باغداران می‌توانند خریداران را امتیاز دهند',
        );
      }
      const hasItem = order.items.some((item) => item.farmerId === farmer.id);
      if (!hasItem) {
        throw new ForbiddenException('شما در این سفارش محصولی ندارید');
      }
    }

    // Check duplicate review
    const existing = await this.prisma.review.findFirst({
      where: {
        orderId: dto.orderId,
        authorId,
        targetId: dto.targetId,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new BadRequestException('شما قبلاً برای این سفارش امتیاز داده‌اید');
    }

    const review = await this.prisma.review.create({
      data: {
        orderId: dto.orderId,
        authorId,
        targetId: dto.targetId,
        rating: dto.rating,
        comment: dto.comment,
        type: dto.type,
      },
    });

    // Update target rating
    await this.updateTargetRating(dto.targetId);

    this.logger.log(`Review created: ${review.id}`);
    return review;
  }

  // ============================================
  // Get reviews for a user
  // ============================================
  async getUserReviews(targetId: string, query: QueryReviewsDto) {
    const { page = 1, pageSize = 10 } = query;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { targetId, deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: {
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
      }),
      this.prisma.review.count({ where: { targetId, deletedAt: null } }),
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
  // Get farmer reviews
  // ============================================
  async getFarmerReviews(farmerId: string, query: QueryReviewsDto) {
    const farmer = await this.prisma.farmer.findFirst({
      where: { id: farmerId, deletedAt: null },
    });

    if (!farmer) {
      throw new NotFoundException('باغدار یافت نشد');
    }

    return this.getUserReviews(farmer.userId, query);
  }

  // ============================================
  // Update target rating average
  // ============================================
  private async updateTargetRating(userId: string) {
    const stats = await this.prisma.review.aggregate({
      where: { targetId: userId, deletedAt: null },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const avgRating = stats._avg.rating ?? 0;
    const count = stats._count.rating;

    // Update farmer or buyer rating
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
    });

    if (farmer) {
      await this.prisma.farmer.update({
        where: { userId },
        data: {
          ratingAvg: Math.round(avgRating * 100) / 100,
          ratingCount: count,
        },
      });
    } else {
      const buyer = await this.prisma.buyer.findUnique({
        where: { userId },
      });
      if (buyer) {
        await this.prisma.buyer.update({
          where: { userId },
          data: {
            ratingAvg: Math.round(avgRating * 100) / 100,
            ratingCount: count,
          },
        });
      }
    }
  }
}
