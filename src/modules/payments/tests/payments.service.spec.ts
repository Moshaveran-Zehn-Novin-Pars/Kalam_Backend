import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentsService } from '../payments.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  TransactionType,
} from '@prisma/client';

const mockPrisma = {
  wallet: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  walletTransaction: {
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  order: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  orderStatusHistory: {
    create: jest.fn(),
  },
  payment: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  escrow: {
    upsert: jest.fn(),
    update: jest.fn(),
  },
  farmer: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockWallet = {
  id: 'wallet-uuid-123',
  userId: 'user-uuid-123',
  balance: { toNumber: () => 10000000 },
  heldBalance: { toNumber: () => 0 },
  currency: 'IRR',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockOrder = {
  id: 'order-uuid-123',
  buyerId: 'user-uuid-123',
  orderNumber: 'KLM-2026-00001',
  status: OrderStatus.PENDING_PAYMENT,
  total: { toNumber: () => 5000000 },
  subtotal: { toNumber: () => 4500000 },
  deletedAt: null,
  items: [
    {
      farmerId: 'farmer-uuid-123',
      subtotal: { toNumber: () => 4500000 },
      commission: { toNumber: () => 270000 },
    },
  ],
  escrow: null,
  payment: null,
};

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // getWallet
  // ============================================
  describe('getWallet()', () => {
    it('should return existing wallet', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);

      const result = await service.getWallet('user-uuid-123');

      expect(result.id).toBe('wallet-uuid-123');
    });

    it('should create wallet if not exists', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);
      mockPrisma.wallet.create.mockResolvedValue(mockWallet);

      const result = await service.getWallet('user-uuid-123');

      expect(mockPrisma.wallet.create).toHaveBeenCalled();
      expect(result.id).toBe('wallet-uuid-123');
    });
  });

  // ============================================
  // getTransactions
  // ============================================
  describe('getTransactions()', () => {
    it('should return paginated transactions', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.walletTransaction.findMany.mockResolvedValue([]);
      mockPrisma.walletTransaction.count.mockResolvedValue(0);

      const result = await service.getTransactions('user-uuid-123', {
        page: 1,
        pageSize: 10,
      });

      expect(result.items).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  // ============================================
  // depositToWallet
  // ============================================
  describe('depositToWallet()', () => {
    beforeEach(() => {
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.wallet.update.mockResolvedValue({
        ...mockWallet,
        balance: { toNumber: () => 15000000 },
      });
      mockPrisma.walletTransaction.create.mockResolvedValue({});
    });

    it('should deposit to wallet successfully', async () => {
      await service.depositToWallet('user-uuid-123', {
        amount: 5000000,
      });

      // $transaction mock calls the fn directly, so wallet.update is called
      expect(mockPrisma.wallet.update).toHaveBeenCalled();
      expect(mockPrisma.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: TransactionType.DEPOSIT,
            amount: 5000000,
          }),
        }),
      );
    });

    it('should create wallet transaction record', async () => {
      await service.depositToWallet('user-uuid-123', { amount: 5000000 });

      expect(mockPrisma.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: TransactionType.DEPOSIT,
            amount: 5000000,
          }),
        }),
      );
    });
  });

  // ============================================
  // initiatePayment
  // ============================================
  describe('initiatePayment()', () => {
    beforeEach(() => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockPrisma.payment.findUnique.mockResolvedValue(null);
    });

    it('should throw if order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.initiatePayment('user-uuid-123', {
          orderId: 'non-existent',
          method: PaymentMethod.WALLET,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if order not in PENDING_PAYMENT status', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PAID_HELD,
      });

      await expect(
        service.initiatePayment('user-uuid-123', {
          orderId: 'order-uuid-123',
          method: PaymentMethod.WALLET,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if already paid', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        status: PaymentStatus.SUCCESS,
      });

      await expect(
        service.initiatePayment('user-uuid-123', {
          orderId: 'order-uuid-123',
          method: PaymentMethod.WALLET,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    describe('wallet payment', () => {
      beforeEach(() => {
        mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
        mockPrisma.wallet.update.mockResolvedValue(mockWallet);
        mockPrisma.walletTransaction.create.mockResolvedValue({});
        mockPrisma.payment.upsert.mockResolvedValue({});
        mockPrisma.order.update.mockResolvedValue({});
        mockPrisma.orderStatusHistory.create.mockResolvedValue({});
        mockPrisma.escrow.upsert.mockResolvedValue({});
      });

      it('should pay with wallet successfully', async () => {
        const result = await service.initiatePayment('user-uuid-123', {
          orderId: 'order-uuid-123',
          method: PaymentMethod.WALLET,
        });

        expect(result.success).toBe(true);
        expect(result.method).toBe(PaymentMethod.WALLET);
      });

      it('should throw if insufficient wallet balance', async () => {
        mockPrisma.wallet.findUnique.mockResolvedValue({
          ...mockWallet,
          balance: { toNumber: () => 100 },
        });

        await expect(
          service.initiatePayment('user-uuid-123', {
            orderId: 'order-uuid-123',
            method: PaymentMethod.WALLET,
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('gateway payment', () => {
      beforeEach(() => {
        mockPrisma.payment.upsert.mockResolvedValue({});
        mockPrisma.order.update.mockResolvedValue({});
        mockPrisma.orderStatusHistory.create.mockResolvedValue({});
        mockPrisma.escrow.upsert.mockResolvedValue({});
      });

      it('should simulate gateway payment', async () => {
        const result = await service.initiatePayment('user-uuid-123', {
          orderId: 'order-uuid-123',
          method: PaymentMethod.ONLINE_GATEWAY,
          gateway: 'ZARINPAL',
        });

        expect(result.success).toBe(true);
        expect(result.method).toBe(PaymentMethod.ONLINE_GATEWAY);
      });
    });
  });

  // ============================================
  // releaseEscrow
  // ============================================
  describe('releaseEscrow()', () => {
    beforeEach(() => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.DELIVERED,
        escrow: { status: 'HELD', amount: { toNumber: () => 5000000 } },
      });
      mockPrisma.escrow.update.mockResolvedValue({});
      mockPrisma.order.update.mockResolvedValue({});
      mockPrisma.orderStatusHistory.create.mockResolvedValue({});
      mockPrisma.farmer.findUnique.mockResolvedValue({
        userId: 'farmer-user-id',
        totalSales: { toNumber: () => 0 },
      });
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.wallet.update.mockResolvedValue(mockWallet);
      mockPrisma.walletTransaction.create.mockResolvedValue({});
      mockPrisma.farmer.update.mockResolvedValue({});
    });

    it('should release escrow successfully', async () => {
      const result = await service.releaseEscrow(
        'order-uuid-123',
        'admin-uuid-123',
      );

      expect(result.message).toBe('تسویه با موفقیت انجام شد');
    });

    it('should throw if order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.releaseEscrow('non-existent', 'admin-uuid-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if order not delivered', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.SHIPPING,
        escrow: { status: 'HELD' },
      });

      await expect(
        service.releaseEscrow('order-uuid-123', 'admin-uuid-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if escrow already released', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.DELIVERED,
        escrow: { status: 'RELEASED' },
      });

      await expect(
        service.releaseEscrow('order-uuid-123', 'admin-uuid-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // refundPayment
  // ============================================
  describe('refundPayment()', () => {
    beforeEach(() => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
        payment: {
          status: PaymentStatus.SUCCESS,
          amount: { toNumber: () => 5000000 },
        },
      });
      mockPrisma.payment.update.mockResolvedValue({});
      mockPrisma.order.update.mockResolvedValue({});
      mockPrisma.orderStatusHistory.create.mockResolvedValue({});
      mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrisma.wallet.update.mockResolvedValue(mockWallet);
      mockPrisma.walletTransaction.create.mockResolvedValue({});
    });

    it('should refund payment successfully', async () => {
      const result = await service.refundPayment(
        'order-uuid-123',
        'admin-uuid-123',
      );

      expect(result.message).toBe('استرداد وجه با موفقیت انجام شد');
      expect(mockPrisma.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: TransactionType.REFUND,
          }),
        }),
      );
    });

    it('should throw if order not cancelled', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PENDING_PAYMENT,
        payment: null,
      });

      await expect(
        service.refundPayment('order-uuid-123', 'admin-uuid-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if no successful payment', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
        payment: null,
      });

      await expect(
        service.refundPayment('order-uuid-123', 'admin-uuid-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
