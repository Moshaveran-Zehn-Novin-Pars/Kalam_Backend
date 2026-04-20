import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Get all categories (tree structure)
  // ============================================
  async findAll(includeInactive = false) {
    const categories = await this.prisma.category.findMany({
      where: {
        deletedAt: null,
        parentId: null, // فقط root categories
        ...(!includeInactive && { isActive: true }),
      },
      orderBy: { order: 'asc' },
      include: {
        children: {
          where: {
            deletedAt: null,
            ...(!includeInactive && { isActive: true }),
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    return categories;
  }

  // ============================================
  // Get flat list of all categories
  // ============================================
  async findAllFlat() {
    return this.prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        imageUrl: true,
        commissionRate: true,
        isActive: true,
        order: true,
      },
    });
  }

  // ============================================
  // Get category by ID or slug
  // ============================================
  async findOne(idOrSlug: string) {
    const category = await this.prisma.category.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        children: {
          where: { deletedAt: null, isActive: true },
          orderBy: { order: 'asc' },
        },
        parent: true,
      },
    });

    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }

    return category;
  }

  // ============================================
  // Create category (Admin)
  // ============================================
  async create(dto: CreateCategoryDto) {
    // Check slug uniqueness
    const existing = await this.prisma.category.findFirst({
      where: { slug: dto.slug, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException('این slug قبلاً استفاده شده است');
    }

    // Check parent exists
    if (dto.parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, deletedAt: null },
      });
      if (!parent) {
        throw new NotFoundException('دسته‌بندی والد یافت نشد');
      }
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        parentId: dto.parentId,
        imageUrl: dto.imageUrl,
        commissionRate: dto.commissionRate ?? 0.06,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
      },
    });

    this.logger.log(`Category created: ${category.id}`);
    return category;
  }

  // ============================================
  // Update category (Admin)
  // ============================================
  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }

    // Check slug uniqueness if changed
    if (dto.slug && dto.slug !== category.slug) {
      const existing = await this.prisma.category.findFirst({
        where: { slug: dto.slug, deletedAt: null },
      });
      if (existing) {
        throw new ConflictException('این slug قبلاً استفاده شده است');
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.slug && { slug: dto.slug }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.commissionRate !== undefined && {
          commissionRate: dto.commissionRate,
        }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  // ============================================
  // Delete category (Admin - soft delete)
  // ============================================
  async remove(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: { children: { where: { deletedAt: null } } },
    });

    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }

    if (category.children.length > 0) {
      throw new ConflictException('ابتدا زیردسته‌ها را حذف کنید');
    }

    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'دسته‌بندی با موفقیت حذف شد' };
  }
}
