import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateProductDto, UpdateProductDto, QueryProductsDto } from './dto';
import { ProductStatus, UserRole } from '@prisma/client';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Get all products (catalog)
  // ============================================
  async findAll(query: QueryProductsDto) {
    const {
      page = 1,
      pageSize = 10,
      categoryId,
      farmerId,
      qualityGrade,
      status,
      minPrice,
      maxPrice,
      search,
      requiresColdChain,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * pageSize;

    const where = {
      deletedAt: null,
      status: status ?? ProductStatus.ACTIVE,
      ...(categoryId && { categoryId }),
      ...(farmerId && { farmerId }),
      ...(qualityGrade && { qualityGrade }),
      ...(requiresColdChain !== undefined && { requiresColdChain }),
      ...(minPrice !== undefined && {
        pricePerUnit: { gte: minPrice },
      }),
      ...(maxPrice !== undefined && {
        pricePerUnit: {
          ...(minPrice !== undefined ? { gte: minPrice } : {}),
          lte: maxPrice,
        },
      }),
      ...(search && {
        OR: [
          { name: { contains: search } },
          { description: { contains: search } },
          { origin: { contains: search } },
        ],
      }),
    };

    const orderBy: Record<string, string> = {};
    const allowedSortFields = [
      'pricePerUnit',
      'createdAt',
      'salesCount',
      'viewsCount',
    ];
    if (allowedSortFields.includes(sortBy)) {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy['createdAt'] = 'desc';
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        select: {
          id: true,
          name: true,
          slug: true,
          origin: true,
          qualityGrade: true,
          unit: true,
          pricePerUnit: true,
          minOrderQty: true,
          stockQty: true,
          requiresColdChain: true,
          status: true,
          salesCount: true,
          createdAt: true,
          farmer: {
            select: {
              id: true,
              businessName: true,
              ratingAvg: true,
              verifiedAt: true,
            },
          },
          category: {
            select: { id: true, name: true, slug: true },
          },
          images: {
            where: { isPrimary: true },
            select: { url: true },
            take: 1,
          },
        },
      }),
      this.prisma.product.count({ where }),
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
  // Get product by ID or slug
  // ============================================
  async findOne(idOrSlug: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        farmer: {
          select: {
            id: true,
            businessName: true,
            farmLocation: true,
            ratingAvg: true,
            ratingCount: true,
            verifiedAt: true,
            user: {
              select: { firstName: true, lastName: true, avatar: true },
            },
          },
        },
        category: true,
        images: { orderBy: { order: 'asc' } },
        priceHistory: {
          orderBy: { recordedAt: 'desc' },
          take: 30,
        },
      },
    });

    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }

    // Increment view count
    await this.prisma.product.update({
      where: { id: product.id },
      data: { viewsCount: { increment: 1 } },
    });

    return product;
  }

  // ============================================
  // Get my products (Farmer)
  // ============================================
  async findMyProducts(userId: string, query: QueryProductsDto) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
    });

    if (!farmer) {
      throw new NotFoundException('پروفایل باغدار یافت نشد');
    }

    return this.findAll({ ...query, farmerId: farmer.id, status: undefined });
  }

  // ============================================
  // Create product (Farmer)
  // ============================================
  async create(userId: string, dto: CreateProductDto) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
    });

    if (!farmer) {
      throw new ForbiddenException('فقط باغداران می‌توانند محصول اضافه کنند');
    }

    // Check slug uniqueness
    const existing = await this.prisma.product.findFirst({
      where: { slug: dto.slug, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException('این slug قبلاً استفاده شده است');
    }

    // Check category exists
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, deletedAt: null, isActive: true },
    });

    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }

    const product = await this.prisma.product.create({
      data: {
        farmerId: farmer.id,
        categoryId: dto.categoryId,
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        origin: dto.origin,
        harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : undefined,
        qualityGrade: dto.qualityGrade,
        unit: dto.unit,
        pricePerUnit: dto.pricePerUnit,
        minOrderQty: dto.minOrderQty,
        maxOrderQty: dto.maxOrderQty,
        stockQty: dto.stockQty,
        requiresColdChain: dto.requiresColdChain ?? false,
        storageTempMin: dto.storageTempMin,
        storageTempMax: dto.storageTempMax,
        shelfLifeDays: dto.shelfLifeDays,
        status: ProductStatus.DRAFT,
      },
    });

    // Save initial price history
    await this.prisma.priceHistory.create({
      data: {
        productId: product.id,
        pricePerUnit: dto.pricePerUnit,
      },
    });

    this.logger.log(`Product created: ${product.id} by farmer: ${farmer.id}`);
    return product;
  }

  // ============================================
  // Update product (Farmer - own products only)
  // ============================================
  async update(userId: string, productId: string, dto: UpdateProductDto) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId } });

    if (!farmer) {
      throw new ForbiddenException('فقط باغداران می‌توانند محصول ویرایش کنند');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }

    if (product.farmerId !== farmer.id) {
      throw new ForbiddenException('شما مجاز به ویرایش این محصول نیستید');
    }

    // Track price change
    if (
      dto.pricePerUnit &&
      dto.pricePerUnit !== product.pricePerUnit.toNumber()
    ) {
      await this.prisma.priceHistory.create({
        data: {
          productId: product.id,
          pricePerUnit: dto.pricePerUnit,
        },
      });
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.origin !== undefined && { origin: dto.origin }),
        ...(dto.harvestDate && { harvestDate: new Date(dto.harvestDate) }),
        ...(dto.qualityGrade && { qualityGrade: dto.qualityGrade }),
        ...(dto.pricePerUnit !== undefined && {
          pricePerUnit: dto.pricePerUnit,
        }),
        ...(dto.minOrderQty !== undefined && { minOrderQty: dto.minOrderQty }),
        ...(dto.maxOrderQty !== undefined && { maxOrderQty: dto.maxOrderQty }),
        ...(dto.stockQty !== undefined && { stockQty: dto.stockQty }),
        ...(dto.requiresColdChain !== undefined && {
          requiresColdChain: dto.requiresColdChain,
        }),
        ...(dto.storageTempMin !== undefined && {
          storageTempMin: dto.storageTempMin,
        }),
        ...(dto.storageTempMax !== undefined && {
          storageTempMax: dto.storageTempMax,
        }),
        ...(dto.shelfLifeDays !== undefined && {
          shelfLifeDays: dto.shelfLifeDays,
        }),
      },
    });
  }

  // ============================================
  // Approve product (Admin)
  // ============================================
  async approveProduct(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.ACTIVE },
    });
  }

  // ============================================
  // Delete product (Farmer or Admin)
  // ============================================
  async remove(userId: string, productId: string, userRole: UserRole) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }

    if (userRole !== UserRole.ADMIN) {
      const farmer = await this.prisma.farmer.findUnique({ where: { userId } });
      if (!farmer || product.farmerId !== farmer.id) {
        throw new ForbiddenException('شما مجاز به حذف این محصول نیستید');
      }
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date() },
    });

    return { message: 'محصول با موفقیت حذف شد' };
  }

  // ============================================
  // Reserve stock (for order creation)
  // ============================================
  async reserveStock(productId: string, quantity: number): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, status: ProductStatus.ACTIVE },
    });

    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }

    const availableStock =
      product.stockQty.toNumber() - product.reservedQty.toNumber();

    if (availableStock < quantity) {
      throw new BadRequestException(
        `موجودی کافی نیست. موجودی در دسترس: ${availableStock} ${product.unit}`,
      );
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: { reservedQty: { increment: quantity } },
    });
  }

  // ============================================
  // Release reserved stock (on order cancel)
  // ============================================
  async releaseStock(productId: string, quantity: number): Promise<void> {
    await this.prisma.product.update({
      where: { id: productId },
      data: { reservedQty: { decrement: quantity } },
    });
  }
}
