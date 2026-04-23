import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OrderStatus, UserRole } from '@prisma/client';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Main Dashboard Stats
  // ============================================
  async getDashboardStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalUsers,
      newUsersThisMonth,
      newUsersLastMonth,
      totalOrders,
      ordersThisMonth,
      ordersLastMonth,
      totalRevenue,
      revenueThisMonth,
      revenueLastMonth,
      activeProducts,
      pendingOrders,
      openDisputes,
      totalFarmers,
      totalBuyers,
    ] = await Promise.all([
      // Users
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({
        where: { createdAt: { gte: startOfMonth }, deletedAt: null },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          deletedAt: null,
        },
      }),

      // Orders
      this.prisma.order.count({ where: { deletedAt: null } }),
      this.prisma.order.count({
        where: { createdAt: { gte: startOfMonth }, deletedAt: null },
      }),
      this.prisma.order.count({
        where: {
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          deletedAt: null,
        },
      }),

      // Revenue
      this.prisma.order.aggregate({
        where: {
          status: { in: [OrderStatus.COMPLETED, OrderStatus.DELIVERED] },
          deletedAt: null,
        },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: {
          status: { in: [OrderStatus.COMPLETED, OrderStatus.DELIVERED] },
          createdAt: { gte: startOfMonth },
          deletedAt: null,
        },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: {
          status: { in: [OrderStatus.COMPLETED, OrderStatus.DELIVERED] },
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          deletedAt: null,
        },
        _sum: { total: true },
      }),

      // Products
      this.prisma.product.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),

      // Pending orders
      this.prisma.order.count({
        where: { status: OrderStatus.PENDING_PAYMENT, deletedAt: null },
      }),

      // Open disputes
      this.prisma.dispute.count({
        where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      }),

      // Farmers
      this.prisma.user.count({
        where: { role: UserRole.FARMER, deletedAt: null },
      }),

      // Buyers
      this.prisma.user.count({
        where: { role: UserRole.BUYER, deletedAt: null },
      }),
    ]);

    const totalRevenueAmount = totalRevenue._sum.total?.toNumber() ?? 0;
    const revenueThisMonthAmount = revenueThisMonth._sum.total?.toNumber() ?? 0;
    const revenueLastMonthAmount = revenueLastMonth._sum.total?.toNumber() ?? 0;

    return {
      users: {
        total: totalUsers,
        farmers: totalFarmers,
        buyers: totalBuyers,
        newThisMonth: newUsersThisMonth,
        growthRate: this.calcGrowthRate(newUsersThisMonth, newUsersLastMonth),
      },
      orders: {
        total: totalOrders,
        thisMonth: ordersThisMonth,
        pending: pendingOrders,
        growthRate: this.calcGrowthRate(ordersThisMonth, ordersLastMonth),
      },
      revenue: {
        total: totalRevenueAmount,
        thisMonth: revenueThisMonthAmount,
        lastMonth: revenueLastMonthAmount,
        growthRate: this.calcGrowthRate(
          revenueThisMonthAmount,
          revenueLastMonthAmount,
        ),
      },
      products: {
        active: activeProducts,
      },
      disputes: {
        open: openDisputes,
      },
    };
  }

  // ============================================
  // Revenue Chart (last N months)
  // ============================================
  async getRevenueChart(months: number = 6) {
    const result: {
      month: string;
      revenue: number;
      orders: number;
      commission: number;
    }[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const [revenue, orders, commission] = await Promise.all([
        this.prisma.order.aggregate({
          where: {
            status: { in: [OrderStatus.COMPLETED, OrderStatus.DELIVERED] },
            createdAt: { gte: start, lte: end },
            deletedAt: null,
          },
          _sum: { total: true },
        }),
        this.prisma.order.count({
          where: {
            createdAt: { gte: start, lte: end },
            deletedAt: null,
          },
        }),
        this.prisma.order.aggregate({
          where: {
            status: { in: [OrderStatus.COMPLETED, OrderStatus.DELIVERED] },
            createdAt: { gte: start, lte: end },
            deletedAt: null,
          },
          _sum: { commissionTotal: true },
        }),
      ]);

      result.push({
        month: start.toISOString().slice(0, 7),
        revenue: revenue._sum.total?.toNumber() ?? 0,
        orders,
        commission: commission._sum.commissionTotal?.toNumber() ?? 0,
      });
    }

    return result;
  }

  // ============================================
  // Orders by Status
  // ============================================
  async getOrdersByStatus() {
    const statuses = Object.values(OrderStatus);
    const result = await Promise.all(
      statuses.map(async (status) => {
        const count = await this.prisma.order.count({
          where: { status, deletedAt: null },
        });
        return { status, count };
      }),
    );

    return result.filter((r) => r.count > 0);
  }

  // ============================================
  // Top Products
  // ============================================
  async getTopProducts(limit: number = 10) {
    return this.prisma.product.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: { salesCount: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        salesCount: true,
        viewsCount: true,
        pricePerUnit: true,
        unit: true,
        qualityGrade: true,
        farmer: {
          select: { businessName: true },
        },
        category: {
          select: { name: true },
        },
      },
    });
  }

  // ============================================
  // Top Farmers
  // ============================================
  async getTopFarmers(limit: number = 10) {
    return this.prisma.farmer.findMany({
      where: { deletedAt: null },
      orderBy: { totalSales: 'desc' },
      take: limit,
      select: {
        id: true,
        businessName: true,
        totalSales: true,
        ratingAvg: true,
        ratingCount: true,
        verifiedAt: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            createdAt: true,
          },
        },
      },
    });
  }

  // ============================================
  // Recent Orders
  // ============================================
  async getRecentOrders(limit: number = 10) {
    return this.prisma.order.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        paymentMethod: true,
        createdAt: true,
        buyer: {
          select: { firstName: true, lastName: true, phone: true },
        },
        items: {
          select: { productName: true, quantity: true },
          take: 1,
        },
      },
    });
  }

  // ============================================
  // User Growth Chart
  // ============================================
  async getUserGrowthChart(months: number = 6) {
    const result: {
      month: string;
      farmers: number;
      buyers: number;
      drivers: number;
      total: number;
    }[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const [farmers, buyers, drivers] = await Promise.all([
        this.prisma.user.count({
          where: {
            role: UserRole.FARMER,
            createdAt: { gte: start, lte: end },
            deletedAt: null,
          },
        }),
        this.prisma.user.count({
          where: {
            role: UserRole.BUYER,
            createdAt: { gte: start, lte: end },
            deletedAt: null,
          },
        }),
        this.prisma.user.count({
          where: {
            role: UserRole.DRIVER,
            createdAt: { gte: start, lte: end },
            deletedAt: null,
          },
        }),
      ]);

      result.push({
        month: start.toISOString().slice(0, 7),
        farmers,
        buyers,
        drivers,
        total: farmers + buyers + drivers,
      });
    }

    return result;
  }

  // ============================================
  // Category Sales Analysis
  // ============================================
  async getCategorySales() {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        products: {
          where: { deletedAt: null },
          select: { salesCount: true },
        },
      },
    });

    return categories
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        totalSales: cat.products.reduce((sum, p) => sum + p.salesCount, 0),
        productCount: cat.products.length,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);
  }

  // ============================================
  // System Health Stats
  // ============================================
  async getSystemStats() {
    const [
      pendingPayments,
      pendingDeliveries,
      lowStockProducts,
      expiredSessions,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { status: OrderStatus.PENDING_PAYMENT, deletedAt: null },
      }),
      this.prisma.delivery.count({
        where: { status: 'PENDING_ASSIGNMENT' },
      }),
      this.prisma.product.count({
        where: {
          stockQty: { lt: 100 },
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),
      this.prisma.session.count({
        where: {
          expiresAt: { lt: new Date() },
          revokedAt: null,
        },
      }),
    ]);

    return {
      pendingPayments,
      pendingDeliveries,
      lowStockProducts,
      expiredSessions,
      generatedAt: new Date(),
    };
  }

  // ============================================
  // Private helpers
  // ============================================
  private calcGrowthRate(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }
}
