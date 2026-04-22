import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Generate invoice for order
  // ============================================
  async generateInvoice(orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        items: true,
        buyer: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            buyer: { select: { businessName: true, economicCode: true } },
          },
        },
        address: true,
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }

    const validStatuses: OrderStatus[] = [
      OrderStatus.PAID_HELD,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.SHIPPING,
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
    ];

    if (!validStatuses.includes(order.status)) {
      throw new BadRequestException(
        'فقط سفارشات پرداخت شده قابل صدور فاکتور هستند',
      );
    }

    // Check existing invoice
    const existing = await this.prisma.invoice.findUnique({
      where: { orderId },
    });

    if (existing) {
      return existing;
    }

    const invoiceNumber = this.generateInvoiceNumber();

    const invoice = await this.prisma.invoice.create({
      data: {
        orderId,
        invoiceNumber,
        totalAmount: order.total,
        taxAmount: order.tax,
      },
    });

    this.logger.log(
      `Invoice generated: ${invoiceNumber} for order: ${orderId}`,
    );
    return invoice;
  }

  // ============================================
  // Get invoice by order
  // ============================================
  async getInvoiceByOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, buyerId: userId, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundException('سفارش یافت نشد');
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { orderId },
      include: {
        order: {
          include: {
            items: true,
            address: true,
            buyer: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                buyer: {
                  select: { businessName: true, economicCode: true },
                },
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('فاکتور یافت نشد');
    }

    return invoice;
  }

  // ============================================
  // Get all invoices (Admin)
  // ============================================
  async findAll() {
    return this.prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            orderNumber: true,
            status: true,
            buyer: {
              select: { firstName: true, lastName: true, phone: true },
            },
          },
        },
      },
    });
  }

  // ============================================
  // Get invoice data (for PDF generation)
  // ============================================
  async getInvoiceData(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        order: {
          include: {
            items: {
              include: {
                product: {
                  select: { name: true, unit: true, origin: true },
                },
              },
            },
            address: true,
            buyer: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                buyer: {
                  select: {
                    businessName: true,
                    economicCode: true,
                    nationalId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('فاکتور یافت نشد');
    }

    // Format invoice data
    return {
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      seller: {
        name: 'پلتفرم کلم',
        address: 'ایران',
        taxId: 'KALAM-TAX-001',
      },
      buyer: {
        name: `${invoice.order.buyer.firstName} ${invoice.order.buyer.lastName}`,
        phone: invoice.order.buyer.phone,
        businessName: invoice.order.buyer.buyer?.businessName,
        economicCode: invoice.order.buyer.buyer?.economicCode,
        address: invoice.order.address.fullAddress,
      },
      items: invoice.order.items.map((item) => ({
        name: item.productName,
        unit: item.unit,
        quantity: item.quantity.toNumber(),
        pricePerUnit: item.pricePerUnit.toNumber(),
        subtotal: item.subtotal.toNumber(),
      })),
      subtotal: invoice.order.subtotal.toNumber(),
      tax: invoice.taxAmount.toNumber(),
      deliveryFee: invoice.order.deliveryFee.toNumber(),
      total: invoice.totalAmount.toNumber(),
    };
  }

  // ============================================
  // Private helpers
  // ============================================
  private generateInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 999999)
      .toString()
      .padStart(6, '0');
    return `INV-${year}-${random}`;
  }
}
