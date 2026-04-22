import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ReviewsService } from '../reviews.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { ReviewType } from '../dto';

const mockPrisma = {
  review: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  order: {
    findFirst: jest.fn(),
  },
  farmer: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  buyer: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockOrder = {
  id: 'order-uuid-123',
  buyerId: 'user-uuid-123',
  status: OrderStatus.DELIVERED,
  deletedAt: null,
  items: [{ farmerId: 'farmer-uuid-123' }],
};

const mockReview = {
  id: 'review-uuid-123',
  orderId: 'order-uuid-123',
  authorId: 'user-uuid-123',
  targetId: 'target-uuid-123',
  rating: 5,
  comment: 'عالی بود',
  type: ReviewType.BUYER_REVIEWS_FARMER,
  createdAt: new Date(),
  deletedAt: null,
};

describe('ReviewsService', () => {
  let service: ReviewsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // createReview
  // ============================================
  describe('createReview()', () => {
    beforeEach(() => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockPrisma.review.findFirst.mockResolvedValue(null);
      mockPrisma.review.create.mockResolvedValue(mockReview);
      mockPrisma.review.aggregate.mockResolvedValue({
        _avg: { rating: 5 },
        _count: { rating: 1 },
      });
      mockPrisma.farmer.findUnique.mockResolvedValue({ id: 'farmer-uuid-123' });
      mockPrisma.farmer.update.mockResolvedValue({});
    });

    it('should create review successfully for buyer', async () => {
      const result = await service.createReview('user-uuid-123', {
        orderId: 'order-uuid-123',
        targetId: 'target-uuid-123',
        rating: 5,
        comment: 'عالی بود',
        type: ReviewType.BUYER_REVIEWS_FARMER,
      });

      expect(result.id).toBe('review-uuid-123');
      expect(mockPrisma.review.create).toHaveBeenCalled();
    });

    it('should throw if order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.createReview('user-uuid-123', {
          orderId: 'non-existent',
          targetId: 'target-uuid-123',
          rating: 5,
          type: ReviewType.BUYER_REVIEWS_FARMER,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if order not delivered', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PENDING_PAYMENT,
      });

      await expect(
        service.createReview('user-uuid-123', {
          orderId: 'order-uuid-123',
          targetId: 'target-uuid-123',
          rating: 5,
          type: ReviewType.BUYER_REVIEWS_FARMER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if buyer tries to review order they did not buy', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        buyerId: 'other-user-id',
      });

      await expect(
        service.createReview('user-uuid-123', {
          orderId: 'order-uuid-123',
          targetId: 'target-uuid-123',
          rating: 5,
          type: ReviewType.BUYER_REVIEWS_FARMER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if duplicate review', async () => {
      mockPrisma.review.findFirst.mockResolvedValue(mockReview);

      await expect(
        service.createReview('user-uuid-123', {
          orderId: 'order-uuid-123',
          targetId: 'target-uuid-123',
          rating: 5,
          type: ReviewType.BUYER_REVIEWS_FARMER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update farmer rating after review', async () => {
      await service.createReview('user-uuid-123', {
        orderId: 'order-uuid-123',
        targetId: 'target-uuid-123',
        rating: 5,
        type: ReviewType.BUYER_REVIEWS_FARMER,
      });

      expect(mockPrisma.farmer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ratingAvg: 5,
            ratingCount: 1,
          }),
        }),
      );
    });
  });

  // ============================================
  // getUserReviews
  // ============================================
  describe('getUserReviews()', () => {
    it('should return paginated reviews', async () => {
      mockPrisma.review.findMany.mockResolvedValue([mockReview]);
      mockPrisma.review.count.mockResolvedValue(1);

      const result = await service.getUserReviews('target-uuid-123', {
        page: 1,
        pageSize: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // ============================================
  // getFarmerReviews
  // ============================================
  describe('getFarmerReviews()', () => {
    it('should return farmer reviews', async () => {
      mockPrisma.farmer.findFirst.mockResolvedValue({
        id: 'farmer-uuid-123',
        userId: 'user-uuid-123',
      });
      mockPrisma.review.findMany.mockResolvedValue([mockReview]);
      mockPrisma.review.count.mockResolvedValue(1);

      const result = await service.getFarmerReviews('farmer-uuid-123', {});

      expect(result.items).toHaveLength(1);
    });

    it('should throw if farmer not found', async () => {
      mockPrisma.farmer.findFirst.mockResolvedValue(null);

      await expect(
        service.getFarmerReviews('non-existent', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
