import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoicesService } from '../invoices.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

const mockPrisma = {
  invoice: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  order: {
    findFirst: jest.fn(),
  },
};

const mockOrder = {
  id: 'order-uuid-123',
  buyerId: 'user-uuid-123',
  orderNumber: 'KLM-2026-00001',
  status: OrderStatus.DELIVERED,
  total: { toNumber: () => 10000000 },
  subtotal: { toNumber: () => 9000000 },
  tax: { toNumber: () => 810000 },
  deliveryFee: { toNumber: () => 500000 },
  deletedAt: null,
  items: [],
  buyer: {
    firstName: 'علی',
    lastName: 'محمدی',
    phone: '09111111111',
    buyer: { businessName: 'سوپرمارکت ستاره', economicCode: null },
  },
  address: {
    fullAddress: 'تهران، خیابان ولیعصر',
    city: 'تهران',
  },
  payment: { status: 'SUCCESS' },
};

const mockInvoice = {
  id: 'invoice-uuid-123',
  orderId: 'order-uuid-123',
  invoiceNumber: 'INV-2026-000001',
  issueDate: new Date(),
  totalAmount: { toNumber: () => 10000000 },
  taxAmount: { toNumber: () => 810000 },
  pdfUrl: null,
  taxSystemRef: null,
  createdAt: new Date(),
};

describe('InvoicesService', () => {
  let service: InvoicesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // generateInvoice
  // ============================================
  describe('generateInvoice()', () => {
    beforeEach(() => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockPrisma.invoice.findUnique.mockResolvedValue(null);
      mockPrisma.invoice.create.mockResolvedValue(mockInvoice);
    });

    it('should generate invoice successfully', async () => {
      const result = await service.generateInvoice('order-uuid-123');

      expect(result.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
      expect(mockPrisma.invoice.create).toHaveBeenCalled();
    });

    it('should return existing invoice if already generated', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);

      const result = await service.generateInvoice('order-uuid-123');

      expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
      expect(result.id).toBe('invoice-uuid-123');
    });

    it('should throw if order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(service.generateInvoice('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if order not paid', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PENDING_PAYMENT,
      });

      await expect(service.generateInvoice('order-uuid-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ============================================
  // getInvoiceByOrder
  // ============================================
  describe('getInvoiceByOrder()', () => {
    it('should return invoice for order owner', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockPrisma.invoice.findUnique.mockResolvedValue({
        ...mockInvoice,
        order: mockOrder,
      });

      const result = await service.getInvoiceByOrder(
        'order-uuid-123',
        'user-uuid-123',
      );

      expect(result.id).toBe('invoice-uuid-123');
    });

    it('should throw if order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.getInvoiceByOrder('non-existent', 'user-uuid-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if invoice not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockPrisma.invoice.findUnique.mockResolvedValue(null);

      await expect(
        service.getInvoiceByOrder('order-uuid-123', 'user-uuid-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================
  // getInvoiceData
  // ============================================
  describe('getInvoiceData()', () => {
    it('should return formatted invoice data', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        ...mockInvoice,
        order: {
          ...mockOrder,
          items: [
            {
              productName: 'سیب قرمز',
              unit: 'KG',
              quantity: { toNumber: () => 200 },
              pricePerUnit: { toNumber: () => 45000 },
              subtotal: { toNumber: () => 9000000 },
              product: { name: 'سیب قرمز', unit: 'KG', origin: 'اصفهان' },
            },
          ],
        },
      });

      const result = await service.getInvoiceData('invoice-uuid-123');

      expect(result.invoiceNumber).toBe('INV-2026-000001');
      expect(result.seller.name).toBe('پلتفرم کلم');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('سیب قرمز');
    });

    it('should throw if invoice not found', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(null);

      await expect(service.getInvoiceData('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================
  // findAll
  // ============================================
  describe('findAll()', () => {
    it('should return all invoices', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([mockInvoice]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
    });
  });
});
