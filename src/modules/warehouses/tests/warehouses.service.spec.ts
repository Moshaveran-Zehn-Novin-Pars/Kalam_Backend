import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { WarehousesService } from '../warehouses.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const mockPrisma = {
  warehouse: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  warehouseReservation: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockWarehouse = {
  id: 'warehouse-uuid-123',
  name: 'سردخانه مرکزی',
  address: 'تهران، جاده مخصوص',
  lat: 35.6892,
  lng: 51.389,
  totalCapacityKg: 10000,
  availableKg: 8000,
  hasRefrigeration: true,
  tempMin: 2,
  tempMax: 8,
  pricePerKgPerDay: { toNumber: () => 500 },
  isActive: true,
  deletedAt: null,
  createdAt: new Date(),
};

const mockReservation = {
  id: 'reservation-uuid-123',
  warehouseId: 'warehouse-uuid-123',
  userId: 'user-uuid-123',
  quantityKg: 500,
  startDate: new Date('2026-05-01'),
  endDate: new Date('2026-05-30'),
  totalPrice: 7250000,
  status: 'ACTIVE',
  createdAt: new Date(),
};

describe('WarehousesService', () => {
  let service: WarehousesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehousesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WarehousesService>(WarehousesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // findAll
  // ============================================
  describe('findAll()', () => {
    it('should return all active warehouses', async () => {
      mockPrisma.warehouse.findMany.mockResolvedValue([mockWarehouse]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(mockPrisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('should filter by refrigeration', async () => {
      mockPrisma.warehouse.findMany.mockResolvedValue([mockWarehouse]);

      await service.findAll(true);

      expect(mockPrisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ hasRefrigeration: true }),
        }),
      );
    });
  });

  // ============================================
  // createWarehouse
  // ============================================
  describe('createWarehouse()', () => {
    it('should create warehouse successfully', async () => {
      mockPrisma.warehouse.create.mockResolvedValue(mockWarehouse);

      const result = await service.createWarehouse({
        name: 'سردخانه مرکزی',
        address: 'تهران',
        lat: 35.6892,
        lng: 51.389,
        totalCapacityKg: 10000,
        hasRefrigeration: true,
        tempMin: 2,
        tempMax: 8,
        pricePerKgPerDay: 500,
      });

      expect(result.name).toBe('سردخانه مرکزی');
      expect(mockPrisma.warehouse.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            availableKg: 10000,
            isActive: true,
          }),
        }),
      );
    });
  });

  // ============================================
  // reserveSpace
  // ============================================
  describe('reserveSpace()', () => {
    beforeEach(() => {
      mockPrisma.warehouse.findFirst.mockResolvedValue(mockWarehouse);
      mockPrisma.warehouseReservation.create.mockResolvedValue(mockReservation);
      mockPrisma.warehouse.update.mockResolvedValue({});
    });

    it('should reserve space successfully', async () => {
      const result = await service.reserveSpace(
        'user-uuid-123',
        'warehouse-uuid-123',
        {
          quantityKg: 500,
          startDate: '2026-05-01',
          endDate: '2026-05-30',
        },
      );

      expect(result.quantityKg).toBe(500);
      expect(mockPrisma.warehouse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { availableKg: { decrement: 500 } },
        }),
      );
    });

    it('should throw if warehouse not found', async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValue(null);

      await expect(
        service.reserveSpace('user-uuid-123', 'non-existent', {
          quantityKg: 500,
          startDate: '2026-05-01',
          endDate: '2026-05-30',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if insufficient capacity', async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValue({
        ...mockWarehouse,
        availableKg: 100,
      });

      await expect(
        service.reserveSpace('user-uuid-123', 'warehouse-uuid-123', {
          quantityKg: 500,
          startDate: '2026-05-01',
          endDate: '2026-05-30',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if end date before start date', async () => {
      await expect(
        service.reserveSpace('user-uuid-123', 'warehouse-uuid-123', {
          quantityKg: 500,
          startDate: '2026-05-30',
          endDate: '2026-05-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should calculate correct total price', async () => {
      await service.reserveSpace('user-uuid-123', 'warehouse-uuid-123', {
        quantityKg: 500,
        startDate: '2026-05-01',
        endDate: '2026-05-30',
      });

      // 500 kg * 500 per kg per day * 29 days = 7,250,000
      expect(mockPrisma.warehouseReservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalPrice: 500 * 500 * 29,
          }),
        }),
      );
    });
  });

  // ============================================
  // cancelReservation
  // ============================================
  describe('cancelReservation()', () => {
    it('should cancel reservation successfully', async () => {
      mockPrisma.warehouseReservation.findFirst.mockResolvedValue(
        mockReservation,
      );
      mockPrisma.warehouseReservation.update.mockResolvedValue({});
      mockPrisma.warehouse.update.mockResolvedValue({});

      const result = await service.cancelReservation(
        'user-uuid-123',
        'reservation-uuid-123',
      );

      expect(result.message).toBe('رزرو با موفقیت لغو شد');
      expect(mockPrisma.warehouse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { availableKg: { increment: 500 } },
        }),
      );
    });

    it('should throw if reservation not found', async () => {
      mockPrisma.warehouseReservation.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelReservation('user-uuid-123', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
