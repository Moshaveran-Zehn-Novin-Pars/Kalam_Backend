import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateAuctionDto, PlaceBidDto } from './dto';

export enum AuctionStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  CANCELLED = 'CANCELLED',
}

@Injectable()
export class AuctionsService {
  private readonly logger = new Logger(AuctionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Create auction (Farmer)
  // ============================================
  async createAuction(userId: string, dto: CreateAuctionDto) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
    });

    if (!farmer) {
      throw new ForbiddenException('فقط باغداران می‌توانند مزایده ایجاد کنند');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, farmerId: farmer.id, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('محصول یافت نشد یا متعلق به شما نیست');
    }

    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (endTime <= startTime) {
      throw new BadRequestException('زمان پایان باید بعد از زمان شروع باشد');
    }

    if (startTime < new Date()) {
      throw new BadRequestException('زمان شروع نمی‌تواند در گذشته باشد');
    }

    // Store auction in Redis-based structure (using LedgerEntry as storage)
    // Since we don't have auction table, we use a creative approach
    const auctionData = {
      id: `auction_${Date.now()}`,
      productId: dto.productId,
      farmerId: farmer.id,
      startingPrice: dto.startingPrice,
      currentPrice: dto.startingPrice,
      minBidIncrement: dto.minBidIncrement ?? 1000,
      reservePrice: dto.reservePrice ?? null,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      status: AuctionStatus.DRAFT,
      bids: [] as { userId: string; amount: number; time: string }[],
      winnerId: null as string | null,
      createdAt: new Date().toISOString(),
    };

    // Save to LedgerEntry as JSON (creative reuse)
    await this.prisma.ledgerEntry.create({
      data: {
        accountId: auctionData.id,
        accountType: 'AUCTION',
        debit: dto.startingPrice,
        credit: 0,
        reference: dto.productId,
        description: JSON.stringify(auctionData),
      },
    });

    this.logger.log(`Auction created: ${auctionData.id}`);
    return auctionData;
  }

  // ============================================
  // Get all auctions
  // ============================================
  async findAll(status?: string) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { accountType: 'AUCTION' },
      orderBy: { createdAt: 'desc' },
    });

    const auctions = entries
      .map(
        (e) =>
          JSON.parse(
            e.description ?? '{}',
          ) as typeof this.parseAuction extends (s: string) => infer R
            ? R
            : never,
      )
      .filter((a) => !status || a.status === status);

    return this.updateAuctionStatuses(auctions);
  }

  // ============================================
  // Get auction by ID
  // ============================================
  async findById(auctionId: string) {
    const entry = await this.prisma.ledgerEntry.findFirst({
      where: { accountId: auctionId, accountType: 'AUCTION' },
    });

    if (!entry) {
      throw new NotFoundException('مزایده یافت نشد');
    }

    const auction = this.parseAuction(entry.description ?? '{}');
    return this.updateAuctionStatus(auction);
  }

  // ============================================
  // Place bid
  // ============================================
  async placeBid(userId: string, auctionId: string, dto: PlaceBidDto) {
    const entry = await this.prisma.ledgerEntry.findFirst({
      where: { accountId: auctionId, accountType: 'AUCTION' },
    });

    if (!entry) {
      throw new NotFoundException('مزایده یافت نشد');
    }

    const auction = this.parseAuction(entry.description ?? '{}');
    const updatedAuction = this.updateAuctionStatus(auction);

    if (updatedAuction.status !== AuctionStatus.ACTIVE) {
      throw new BadRequestException('مزایده فعال نیست');
    }

    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
    });

    if (farmer && updatedAuction.farmerId === farmer.id) {
      throw new ForbiddenException('باغدار نمی‌تواند در مزایده خود شرکت کند');
    }

    const minBid = updatedAuction.currentPrice + updatedAuction.minBidIncrement;
    if (dto.amount < minBid) {
      throw new BadRequestException(
        `پیشنهاد باید حداقل ${minBid.toLocaleString()} ریال باشد`,
      );
    }

    updatedAuction.currentPrice = dto.amount;
    updatedAuction.bids.push({
      userId,
      amount: dto.amount,
      time: new Date().toISOString(),
    });

    await this.prisma.ledgerEntry.updateMany({
      where: { accountId: auctionId, accountType: 'AUCTION' },
      data: { description: JSON.stringify(updatedAuction) },
    });

    this.logger.log(`Bid placed: ${dto.amount} by ${userId} on ${auctionId}`);
    return updatedAuction;
  }

  // ============================================
  // End auction (Admin or auto)
  // ============================================
  async endAuction(auctionId: string) {
    const entry = await this.prisma.ledgerEntry.findFirst({
      where: { accountId: auctionId, accountType: 'AUCTION' },
    });

    if (!entry) {
      throw new NotFoundException('مزایده یافت نشد');
    }

    const auction = this.parseAuction(entry.description ?? '{}');

    if (auction.status === AuctionStatus.ENDED) {
      throw new BadRequestException('مزایده قبلاً پایان یافته');
    }

    const winner =
      auction.bids.length > 0 ? auction.bids[auction.bids.length - 1] : null;

    auction.status = AuctionStatus.ENDED;
    auction.winnerId = winner?.userId ?? null;

    await this.prisma.ledgerEntry.updateMany({
      where: { accountId: auctionId, accountType: 'AUCTION' },
      data: { description: JSON.stringify(auction) },
    });

    this.logger.log(`Auction ended: ${auctionId}, winner: ${winner?.userId}`);
    return {
      auction,
      winner: winner
        ? { userId: winner.userId, winningBid: winner.amount }
        : null,
    };
  }

  // ============================================
  // Private helpers
  // ============================================
  private parseAuction(description: string) {
    return JSON.parse(description) as {
      id: string;
      productId: string;
      farmerId: string;
      startingPrice: number;
      currentPrice: number;
      minBidIncrement: number;
      reservePrice: number | null;
      startTime: string;
      endTime: string;
      status: AuctionStatus;
      bids: { userId: string; amount: number; time: string }[];
      winnerId: string | null;
      createdAt: string;
    };
  }

  private updateAuctionStatus(auction: ReturnType<typeof this.parseAuction>) {
    const now = new Date();
    const start = new Date(auction.startTime);
    const end = new Date(auction.endTime);

    if (auction.status === AuctionStatus.DRAFT && now >= start) {
      auction.status = AuctionStatus.ACTIVE;
    }
    if (auction.status === AuctionStatus.ACTIVE && now >= end) {
      auction.status = AuctionStatus.ENDED;
    }

    return auction;
  }

  private updateAuctionStatuses(
    auctions: ReturnType<typeof this.parseAuction>[],
  ) {
    return auctions.map((a) => this.updateAuctionStatus(a));
  }
}
