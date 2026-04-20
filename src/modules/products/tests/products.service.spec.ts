import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ProductsService } from '../products.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { QualityGrade, ProductStatus, UserRole } from '@prisma/client';

const mockPrisma = {
  product: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  farmer: {
    findUnique: jest.fn(),
  },
  category: {
    findFirst: jest.fn(),
  },
  priceHistory: {
    create: jest.fn(),
  },
};

const mockFarmer = {
  id: 'farmer-uuid-123',
  userId: 'user-uuid-123',
  businessName: 'باغ سیب',
};

const mockCategory = {
  id: 'cat-uuid-123',
  name: 'میوه‌جات',
  slug: 'fruits',
  isActive: true,
  deletedAt: null,
};

const mockProduct = {
  id: 'prod-uuid-123',
  farmerId: 'farmer-uuid-123',
  categoryId: 'cat-uuid-123',
  name: 'سیب قرمز',
  slug: 'red-apple',
  description: null,
  origin: 'اصفهان',
  qualityGrade: QualityGrade.A,
  unit: 'KG',
  pricePerUnit: { toNumber: () => 45000 },
  minOrderQty: { toNumber: () => 100 },
  maxOrderQty: null,
  stockQty: { toNumber: () => 5000 },
  reservedQty: { toNumber: () => 0 },
  status: ProductStatus.ACTIVE,
  requiresColdChain: false,
  viewsCount: 0,
  salesCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockCreateDto = {
  categoryId: 'cat-uuid-123',
  name: 'سیب قرمز',
  slug: 'red-apple',
  qualityGrade: QualityGrade.A,
  unit: 'KG',
  pricePerUnit: 45000,
  minOrderQty: 100,
  stockQty: 5000,
};

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // findAll
  // ============================================
  describe('findAll()', () => {
    beforeEach(() => {
      mockPrisma.product.findMany.mockResolvedValue([mockProduct]);
      mockPrisma.product.count.mockResolvedValue(1);
    });

    it('should return paginated products', async () => {
      const result = await service.findAll({ page: 1, pageSize: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by categoryId', async () => {
      await service.findAll({ categoryId: 'cat-uuid-123' });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: 'cat-uuid-123' }),
        }),
      );
    });

    it('should filter by qualityGrade', async () => {
      await service.findAll({ qualityGrade: QualityGrade.A });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ qualityGrade: QualityGrade.A }),
        }),
      );
    });

    it('should search in name, description, origin', async () => {
      await service.findAll({ search: 'سیب' });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ name: { contains: 'سیب' } }]),
          }),
        }),
      );
    });

    it('should filter by price range', async () => {
      await service.findAll({ minPrice: 10000, maxPrice: 50000 });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            pricePerUnit: expect.objectContaining({
              gte: 10000,
              lte: 50000,
            }),
          }),
        }),
      );
    });
  });

  // ============================================
  // findOne
  // ============================================
  describe('findOne()', () => {
    it('should return product and increment views', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        ...mockProduct,
        farmer: mockFarmer,
        category: mockCategory,
        images: [],
        priceHistory: [],
      });
      mockPrisma.product.update.mockResolvedValue({
        ...mockProduct,
        viewsCount: 1,
      });

      const result = await service.findOne('prod-uuid-123');

      expect(result.id).toBe('prod-uuid-123');
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { viewsCount: { increment: 1 } },
        }),
      );
    });

    it('should throw if not found', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================
  // create
  // ============================================
  describe('create()', () => {
    beforeEach(() => {
      mockPrisma.farmer.findUnique.mockResolvedValue(mockFarmer);
      mockPrisma.product.findFirst.mockResolvedValue(null);
      mockPrisma.category.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.product.create.mockResolvedValue(mockProduct);
      mockPrisma.priceHistory.create.mockResolvedValue({});
    });

    it('should create product successfully', async () => {
      const result = await service.create('user-uuid-123', mockCreateDto);

      expect(result.id).toBe('prod-uuid-123');
      expect(mockPrisma.priceHistory.create).toHaveBeenCalled();
    });

    it('should throw if user is not farmer', async () => {
      mockPrisma.farmer.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-uuid-123', mockCreateDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if slug already exists', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(mockProduct);

      await expect(
        service.create('user-uuid-123', mockCreateDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw if category not found', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);
      mockPrisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-uuid-123', mockCreateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create product with DRAFT status', async () => {
      await service.create('user-uuid-123', mockCreateDto);

      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ProductStatus.DRAFT,
          }),
        }),
      );
    });
  });

  // ============================================
  // update
  // ============================================
  describe('update()', () => {
    beforeEach(() => {
      mockPrisma.farmer.findUnique.mockResolvedValue(mockFarmer);
      mockPrisma.product.findFirst.mockResolvedValue(mockProduct);
      mockPrisma.product.update.mockResolvedValue({
        ...mockProduct,
        name: 'سیب سبز',
      });
      mockPrisma.priceHistory.create.mockResolvedValue({});
    });

    it('should update product', async () => {
      const result = await service.update('user-uuid-123', 'prod-uuid-123', {
        name: 'سیب سبز',
      });

      expect(result.name).toBe('سیب سبز');
    });

    it('should track price change', async () => {
      await service.update('user-uuid-123', 'prod-uuid-123', {
        pricePerUnit: 50000,
      });

      expect(mockPrisma.priceHistory.create).toHaveBeenCalled();
    });

    it('should throw if not owner', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        ...mockProduct,
        farmerId: 'other-farmer-id',
      });

      await expect(
        service.update('user-uuid-123', 'prod-uuid-123', { name: 'test' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================
  // reserveStock
  // ============================================
  describe('reserveStock()', () => {
    it('should reserve stock successfully', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(mockProduct);
      mockPrisma.product.update.mockResolvedValue({});

      await expect(
        service.reserveStock('prod-uuid-123', 100),
      ).resolves.not.toThrow();

      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { reservedQty: { increment: 100 } },
        }),
      );
    });

    it('should throw if insufficient stock', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        ...mockProduct,
        stockQty: { toNumber: () => 50 },
        reservedQty: { toNumber: () => 0 },
      });

      await expect(service.reserveStock('prod-uuid-123', 100)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ============================================
  // approveProduct
  // ============================================
  describe('approveProduct()', () => {
    it('should approve product', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(mockProduct);
      mockPrisma.product.update.mockResolvedValue({
        ...mockProduct,
        status: ProductStatus.ACTIVE,
      });

      const result = await service.approveProduct('prod-uuid-123');

      expect(result.status).toBe(ProductStatus.ACTIVE);
    });

    it('should throw if not found', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(service.approveProduct('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ============================================
  // remove
  // ============================================
  describe('remove()', () => {
    beforeEach(() => {
      mockPrisma.product.findFirst.mockResolvedValue(mockProduct);
      mockPrisma.farmer.findUnique.mockResolvedValue(mockFarmer);
      mockPrisma.product.update.mockResolvedValue({});
    });

    it('should soft delete product as owner farmer', async () => {
      const result = await service.remove(
        'user-uuid-123',
        'prod-uuid-123',
        UserRole.FARMER,
      );

      expect(result.message).toBe('محصول با موفقیت حذف شد');
    });

    it('should allow admin to delete any product', async () => {
      const result = await service.remove(
        'admin-uuid-123',
        'prod-uuid-123',
        UserRole.ADMIN,
      );

      expect(result.message).toBe('محصول با موفقیت حذف شد');
    });

    it('should throw if farmer tries to delete other farmer product', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        ...mockProduct,
        farmerId: 'other-farmer-id',
      });

      await expect(
        service.remove('user-uuid-123', 'prod-uuid-123', UserRole.FARMER),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
