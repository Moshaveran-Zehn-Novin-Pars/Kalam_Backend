import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DriversService } from '../drivers.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const mockPrisma = {
  driver: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockDriver = {
  id: 'driver-uuid-123',
  userId: 'user-uuid-123',
  vehicleType: 'VAN',
  vehiclePlate: '12ایران345',
  capacityKg: 1000,
  hasRefrigeration: false,
  licenseNumber: 'DL123456',
  licenseExpiresAt: new Date('2027-01-01'),
  ratingAvg: 4.8,
  ratingCount: 20,
  ordersDelivered: 50,
  currentLat: null,
  currentLng: null,
  isAvailable: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('DriversService', () => {
  let service: DriversService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriversService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DriversService>(DriversService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMyProfile()', () => {
    it('should return driver profile', async () => {
      mockPrisma.driver.findUnique.mockResolvedValue({
        ...mockDriver,
        user: { id: 'user-uuid-123', phone: '09333333331' },
      });

      const result = await service.getMyProfile('user-uuid-123');

      expect(result.vehicleType).toBe('VAN');
    });

    it('should throw if driver not found', async () => {
      mockPrisma.driver.findUnique.mockResolvedValue(null);

      await expect(service.getMyProfile('user-uuid-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateStatus()', () => {
    beforeEach(() => {
      mockPrisma.driver.findUnique.mockResolvedValue(mockDriver);
      mockPrisma.driver.update.mockResolvedValue({
        ...mockDriver,
        isAvailable: false,
        currentLat: 35.6892,
        currentLng: 51.389,
      });
    });

    it('should update driver status', async () => {
      const result = await service.updateStatus('user-uuid-123', {
        isAvailable: false,
        currentLat: 35.6892,
        currentLng: 51.389,
      });

      expect(result.isAvailable).toBe(false);
      expect(result.currentLat).toBe(35.6892);
    });

    it('should throw if driver not found', async () => {
      mockPrisma.driver.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('user-uuid-123', { isAvailable: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAvailable()', () => {
    it('should return available drivers', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([mockDriver]);

      const result = await service.findAvailable();

      expect(result).toHaveLength(1);
      expect(mockPrisma.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isAvailable: true }),
        }),
      );
    });
  });
});
