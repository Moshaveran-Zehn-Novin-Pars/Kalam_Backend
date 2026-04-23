import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AuctionsService, AuctionStatus } from '../auctions.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const mockPrisma = {
  farmer: { findUnique: jest.fn() },
  product: { findFirst: jest.fn() },
  ledgerEntry: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockFarmer = {
  id: 'farmer-uuid-123',
  userId: 'user-uuid-123',
};

const mockProduct = {
  id: 'prod-uuid-123',
  farmerId: 'farmer-uuid-123',
  deletedAt: null,
};

const mockAuctionData = {
  id: 'auction_123',
  productId: 'prod-uuid-123',
  farmerId: 'farmer-uuid-123',
  startingPrice: 10000,
  currentPrice: 10000,
  minBidIncrement: 1000,
  reservePrice: null,
  startTime: new Date(Date.now() - 1000).toISOString(),
  endTime: new Date(Date.now() + 3600000).toISOString(),
  status: AuctionStatus.ACTIVE,
  bids: [],
  winnerId: null,
  createdAt: new Date().toISOString(),
};

describe('AuctionsService', () => {
  let service: AuctionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuctionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuctionsService>(AuctionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // createAuction
  // ============================================
  describe('createAuction()', () => {
    beforeEach(() => {
      mockPrisma.farmer.findUnique.mockResolvedValue(mockFarmer);
      mockPrisma.product.findFirst.mockResolvedValue(mockProduct);
      mockPrisma.ledgerEntry.create.mockResolvedValue({});
    });

    it('should create auction successfully', async () => {
      const result = await service.createAuction('user-uuid-123', {
        productId: 'prod-uuid-123',
        startingPrice: 10000,
        startTime: new Date(Date.now() + 3600000).toISOString(),
        endTime: new Date(Date.now() + 7200000).toISOString(),
      });

      expect(result.startingPrice).toBe(10000);
      expect(result.status).toBe(AuctionStatus.DRAFT);
      expect(mockPrisma.ledgerEntry.create).toHaveBeenCalled();
    });

    it('should throw if user is not farmer', async () => {
      mockPrisma.farmer.findUnique.mockResolvedValue(null);

      await expect(
        service.createAuction('user-uuid-123', {
          productId: 'prod-uuid-123',
          startingPrice: 10000,
          startTime: new Date(Date.now() + 3600000).toISOString(),
          endTime: new Date(Date.now() + 7200000).toISOString(),
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if product not found', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.createAuction('user-uuid-123', {
          productId: 'non-existent',
          startingPrice: 10000,
          startTime: new Date(Date.now() + 3600000).toISOString(),
          endTime: new Date(Date.now() + 7200000).toISOString(),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if endTime before startTime', async () => {
      await expect(
        service.createAuction('user-uuid-123', {
          productId: 'prod-uuid-123',
          startingPrice: 10000,
          startTime: new Date(Date.now() + 7200000).toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if startTime is in the past', async () => {
      await expect(
        service.createAuction('user-uuid-123', {
          productId: 'prod-uuid-123',
          startingPrice: 10000,
          startTime: new Date(Date.now() - 3600000).toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // placeBid
  // ============================================
  describe('placeBid()', () => {
    beforeEach(() => {
      mockPrisma.ledgerEntry.findFirst.mockResolvedValue({
        description: JSON.stringify(mockAuctionData),
      });
      mockPrisma.ledgerEntry.updateMany.mockResolvedValue({});
      mockPrisma.farmer.findUnique.mockResolvedValue(null); // buyer has no farmer profile
    });

    it('should place bid successfully', async () => {
      const result = await service.placeBid('buyer-uuid-123', 'auction_123', {
        amount: 15000,
      });

      expect(result.currentPrice).toBe(15000);
      expect(result.bids).toHaveLength(1);
    });

    it('should throw if auction not found', async () => {
      mockPrisma.ledgerEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.placeBid('buyer-uuid-123', 'non-existent', { amount: 15000 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if bid below minimum', async () => {
      await expect(
        service.placeBid('buyer-uuid-123', 'auction_123', { amount: 5000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if farmer bids on own auction', async () => {
      // farmer's userId matches the auction farmerId
      mockPrisma.farmer.findUnique.mockResolvedValue({
        id: 'farmer-uuid-123', // همون farmerId که توی auction هست
        userId: 'user-uuid-123',
      });

      await expect(
        service.placeBid('user-uuid-123', 'auction_123', { amount: 15000 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if auction is not active', async () => {
      mockPrisma.ledgerEntry.findFirst.mockResolvedValue({
        description: JSON.stringify({
          ...mockAuctionData,
          status: AuctionStatus.ENDED,
        }),
      });

      await expect(
        service.placeBid('buyer-uuid-123', 'auction_123', { amount: 15000 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // endAuction
  // ============================================
  describe('endAuction()', () => {
    it('should end auction with winner', async () => {
      mockPrisma.ledgerEntry.findFirst.mockResolvedValue({
        description: JSON.stringify({
          ...mockAuctionData,
          bids: [
            {
              userId: 'buyer-uuid-123',
              amount: 20000,
              time: new Date().toISOString(),
            },
          ],
        }),
      });
      mockPrisma.ledgerEntry.updateMany.mockResolvedValue({});

      const result = await service.endAuction('auction_123');

      expect(result.winner?.userId).toBe('buyer-uuid-123');
      expect(result.winner?.winningBid).toBe(20000);
    });

    it('should end auction with no winner', async () => {
      mockPrisma.ledgerEntry.findFirst.mockResolvedValue({
        description: JSON.stringify({ ...mockAuctionData, bids: [] }),
      });
      mockPrisma.ledgerEntry.updateMany.mockResolvedValue({});

      const result = await service.endAuction('auction_123');

      expect(result.winner).toBeNull();
    });

    it('should throw if auction already ended', async () => {
      mockPrisma.ledgerEntry.findFirst.mockResolvedValue({
        description: JSON.stringify({
          ...mockAuctionData,
          status: AuctionStatus.ENDED,
        }),
      });

      await expect(service.endAuction('auction_123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
