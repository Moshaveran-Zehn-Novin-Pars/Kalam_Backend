import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from '../admin.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

const mockPrisma = {
  user: {
    count: jest.fn(),
  },
  order: {
    count: jest.fn(),
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
  product: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  farmer: {
    findMany: jest.fn(),
  },
  dispute: {
    count: jest.fn(),
  },
  delivery: {
    count: jest.fn(),
  },
  session: {
    count: jest.fn(),
  },
  category: {
    findMany: jest.fn(),
  },
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // getDashboardStats
  // ============================================
  describe('getDashboardStats()', () => {
    beforeEach(() => {
      mockPrisma.user.count.mockResolvedValue(100);
      mockPrisma.order.count.mockResolvedValue(50);
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: {
          total: { toNumber: () => 50000000 },
          commissionTotal: { toNumber: () => 3000000 },
        },
      });
      mockPrisma.product.count.mockResolvedValue(30);
      mockPrisma.dispute.count.mockResolvedValue(2);
    });

    it('should return dashboard stats', async () => {
      const result = await service.getDashboardStats();

      expect(result.users).toBeDefined();
      expect(result.orders).toBeDefined();
      expect(result.revenue).toBeDefined();
      expect(result.products).toBeDefined();
      expect(result.disputes).toBeDefined();
    });

    it('should calculate growth rate correctly', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(20) // new this month
        .mockResolvedValueOnce(10) // new last month
        .mockResolvedValue(50); // rest

      const result = await service.getDashboardStats();

      expect(result.users.growthRate).toBe(100); // 20 vs 10 = 100% growth
    });

    it('should handle zero previous month gracefully', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(0)
        .mockResolvedValue(50);

      const result = await service.getDashboardStats();

      expect(result.users.growthRate).toBe(100);
    });
  });

  // ============================================
  // getRevenueChart
  // ============================================
  describe('getRevenueChart()', () => {
    beforeEach(() => {
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: {
          total: { toNumber: () => 10000000 },
          commissionTotal: { toNumber: () => 600000 },
        },
      });
      mockPrisma.order.count.mockResolvedValue(15);
    });

    it('should return revenue chart for 6 months', async () => {
      const result = await service.getRevenueChart(6);

      expect(result).toHaveLength(6);
      expect(result[0]).toHaveProperty('month');
      expect(result[0]).toHaveProperty('revenue');
      expect(result[0]).toHaveProperty('orders');
      expect(result[0]).toHaveProperty('commission');
    });

    it('should return correct number of months', async () => {
      const result = await service.getRevenueChart(3);

      expect(result).toHaveLength(3);
    });

    it('should handle null revenue', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { total: null, commissionTotal: null },
      });

      const result = await service.getRevenueChart(1);

      expect(result[0].revenue).toBe(0);
      expect(result[0].commission).toBe(0);
    });
  });

  // ============================================
  // getOrdersByStatus
  // ============================================
  describe('getOrdersByStatus()', () => {
    it('should return orders grouped by status', async () => {
      mockPrisma.order.count
        .mockResolvedValueOnce(5) // PENDING_PAYMENT
        .mockResolvedValueOnce(10) // PAID_HELD
        .mockResolvedValueOnce(0) // CONFIRMED
        .mockResolvedValue(0);

      const result = await service.getOrdersByStatus();

      expect(result.length).toBeGreaterThan(0);
      result.forEach((r) => {
        expect(r.count).toBeGreaterThan(0);
      });
    });
  });

  // ============================================
  // getTopProducts
  // ============================================
  describe('getTopProducts()', () => {
    it('should return top products', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          name: 'سیب قرمز',
          salesCount: 500,
          viewsCount: 1000,
          pricePerUnit: { toNumber: () => 45000 },
          unit: 'KG',
          qualityGrade: 'A',
          farmer: { businessName: 'باغ سیب' },
          category: { name: 'میوه‌جات' },
        },
      ]);

      const result = await service.getTopProducts(10);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('سیب قرمز');
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { salesCount: 'desc' },
          take: 10,
        }),
      );
    });
  });

  // ============================================
  // getTopFarmers
  // ============================================
  describe('getTopFarmers()', () => {
    it('should return top farmers', async () => {
      mockPrisma.farmer.findMany.mockResolvedValue([
        {
          id: 'farmer-1',
          businessName: 'باغ سیب طلایی',
          totalSales: { toNumber: () => 50000000 },
          ratingAvg: 4.8,
          ratingCount: 50,
          verifiedAt: new Date(),
          user: {
            firstName: 'محمد',
            lastName: 'باغدار',
            phone: '09111111111',
            createdAt: new Date(),
          },
        },
      ]);

      const result = await service.getTopFarmers(5);

      expect(result).toHaveLength(1);
      expect(mockPrisma.farmer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { totalSales: 'desc' },
          take: 5,
        }),
      );
    });
  });

  // ============================================
  // getRecentOrders
  // ============================================
  describe('getRecentOrders()', () => {
    it('should return recent orders', async () => {
      mockPrisma.order.findMany.mockResolvedValue([
        {
          id: 'order-1',
          orderNumber: 'KLM-2026-00001',
          status: OrderStatus.COMPLETED,
          total: { toNumber: () => 5000000 },
          paymentMethod: 'WALLET',
          createdAt: new Date(),
          buyer: { firstName: 'رضا', lastName: 'خریدار', phone: '09222222221' },
          items: [{ productName: 'سیب قرمز', quantity: 200 }],
        },
      ]);

      const result = await service.getRecentOrders(10);

      expect(result).toHaveLength(1);
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      );
    });
  });

  // ============================================
  // getUserGrowthChart
  // ============================================
  describe('getUserGrowthChart()', () => {
    beforeEach(() => {
      mockPrisma.user.count.mockResolvedValue(5);
    });

    it('should return user growth for N months', async () => {
      const result = await service.getUserGrowthChart(3);

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('month');
      expect(result[0]).toHaveProperty('farmers');
      expect(result[0]).toHaveProperty('buyers');
      expect(result[0]).toHaveProperty('drivers');
      expect(result[0]).toHaveProperty('total');
    });

    it('should sum totals correctly', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(3) // farmers
        .mockResolvedValueOnce(5) // buyers
        .mockResolvedValueOnce(2); // drivers

      const result = await service.getUserGrowthChart(1);

      expect(result[0].total).toBe(10);
    });
  });

  // ============================================
  // getCategorySales
  // ============================================
  describe('getCategorySales()', () => {
    it('should return category sales sorted by total', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        {
          id: 'cat-1',
          name: 'میوه‌جات',
          products: [{ salesCount: 300 }, { salesCount: 200 }],
        },
        {
          id: 'cat-2',
          name: 'سبزیجات',
          products: [{ salesCount: 100 }],
        },
      ]);

      const result = await service.getCategorySales();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('میوه‌جات');
      expect(result[0].totalSales).toBe(500);
      expect(result[1].totalSales).toBe(100);
    });
  });

  // ============================================
  // getSystemStats
  // ============================================
  describe('getSystemStats()', () => {
    it('should return system health stats', async () => {
      mockPrisma.order.count.mockResolvedValue(3);
      mockPrisma.delivery.count.mockResolvedValue(2);
      mockPrisma.product.count.mockResolvedValue(5);
      mockPrisma.session.count.mockResolvedValue(10);

      const result = await service.getSystemStats();

      expect(result.pendingPayments).toBe(3);
      expect(result.pendingDeliveries).toBe(2);
      expect(result.lowStockProducts).toBe(5);
      expect(result.expiredSessions).toBe(10);
      expect(result.generatedAt).toBeDefined();
    });
  });
});
