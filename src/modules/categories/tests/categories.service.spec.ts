import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CategoriesService } from '../categories.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const mockPrisma = {
  category: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

const mockCategory = {
  id: 'cat-uuid-123',
  name: 'میوه‌جات',
  slug: 'fruits',
  parentId: null,
  imageUrl: null,
  commissionRate: 0.06,
  isActive: true,
  order: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // findAll
  // ============================================
  describe('findAll()', () => {
    it('should return tree of categories', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { ...mockCategory, children: [] },
      ]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ parentId: null }),
        }),
      );
    });

    it('should filter inactive categories by default', async () => {
      mockPrisma.category.findMany.mockResolvedValue([]);

      await service.findAll(false);

      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('should include inactive when flag is true', async () => {
      mockPrisma.category.findMany.mockResolvedValue([]);

      await service.findAll(true);

      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  // ============================================
  // findOne
  // ============================================
  describe('findOne()', () => {
    it('should find category by id', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        ...mockCategory,
        children: [],
        parent: null,
      });

      const result = await service.findOne('cat-uuid-123');

      expect(result.id).toBe('cat-uuid-123');
    });

    it('should find category by slug', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        ...mockCategory,
        children: [],
        parent: null,
      });

      const result = await service.findOne('fruits');

      expect(result.slug).toBe('fruits');
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(null);

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
      mockPrisma.category.findFirst.mockResolvedValue(null);
      mockPrisma.category.create.mockResolvedValue(mockCategory);
    });

    it('should create category successfully', async () => {
      const result = await service.create({
        name: 'میوه‌جات',
        slug: 'fruits',
      });

      expect(result.id).toBe('cat-uuid-123');
      expect(mockPrisma.category.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if slug exists', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(mockCategory);

      await expect(
        service.create({ name: 'test', slug: 'fruits' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if parent not found', async () => {
      mockPrisma.category.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(
        service.create({
          name: 'test',
          slug: 'test',
          parentId: 'non-existent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should set default commission rate', async () => {
      await service.create({ name: 'test', slug: 'test-slug' });

      expect(mockPrisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ commissionRate: 0.06 }),
        }),
      );
    });
  });

  // ============================================
  // update
  // ============================================
  describe('update()', () => {
    beforeEach(() => {
      mockPrisma.category.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.category.update.mockResolvedValue({
        ...mockCategory,
        name: 'میوه‌جات جدید',
      });
    });

    it('should update category', async () => {
      const result = await service.update('cat-uuid-123', {
        name: 'میوه‌جات جدید',
      });

      expect(result.name).toBe('میوه‌جات جدید');
    });

    it('should throw if category not found', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.update('non-existent', { name: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if new slug already exists', async () => {
      mockPrisma.category.findFirst
        .mockResolvedValueOnce(mockCategory)
        .mockResolvedValueOnce({ ...mockCategory, id: 'other-id' });

      await expect(
        service.update('cat-uuid-123', { slug: 'existing-slug' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ============================================
  // remove
  // ============================================
  describe('remove()', () => {
    it('should soft delete category', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        ...mockCategory,
        children: [],
      });
      mockPrisma.category.update.mockResolvedValue({
        ...mockCategory,
        deletedAt: new Date(),
      });

      const result = await service.remove('cat-uuid-123');

      expect(result.message).toBe('دسته‌بندی با موفقیت حذف شد');
    });

    it('should throw if has children', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        ...mockCategory,
        children: [{ id: 'child-id' }],
      });

      await expect(service.remove('cat-uuid-123')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw if not found', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
