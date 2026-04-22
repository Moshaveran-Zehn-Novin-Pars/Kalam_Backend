import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DeliveriesService } from '../deliveries.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { DeliveryStatus, OrderStatus } from '@prisma/client';

const mockPrisma = {
  delivery: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  deliveryLocation: {
    create: jest.fn(),
  },
  driver: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  order: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  orderStatusHistory: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockDriver = {
  id: 'driver-uuid-123',
  userId: 'driver-user-uuid-123',
  vehicleType: 'VAN',
  vehiclePlate: '12ایران345',
  capacityKg: 1000,
  hasRefrigeration: false,
  isAvailable: true,
  ordersDelivered: 10,
  currentLat: null,
  currentLng: null,
};

const mockDelivery = {
  id: 'delivery-uuid-123',
  orderId: 'order-uuid-123',
  driverId: 'driver-uuid-123',
  status: DeliveryStatus.ASSIGNED,
  pickupLat: 35.6892,
  pickupLng: 51.389,
  dropoffLat: 35.7,
  dropoffLng: 51.4,
  distanceKm: null,
  deliveryFee: 500000,
  scheduledAt: new Date(),
  pickedUpAt: null,
  deliveredAt: null,
  proofImage: null,
  signatureImage: null,
  recipientName: null,
  temperatureLog: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockOrder = {
  id: 'order-uuid-123',
  buyerId: 'user-uuid-123',
  status: OrderStatus.CONFIRMED,
  deliveryFee: { toNumber: () => 500000 },
  deletedAt: null,
  delivery: null,
  address: {
    lat: { toNumber: () => 35.7 },
    lng: { toNumber: () => 51.4 },
    fullAddress: 'تهران',
  },
};

describe('DeliveriesService', () => {
  let service: DeliveriesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveriesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DeliveriesService>(DeliveriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // createDelivery
  // ============================================
  describe('createDelivery()', () => {
    beforeEach(() => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockPrisma.delivery.create.mockResolvedValue(mockDelivery);
    });

    it('should create delivery successfully', async () => {
      const result = await service.createDelivery(
        'order-uuid-123',
        'admin-uuid-123',
      );

      expect(result.id).toBe('delivery-uuid-123');
      expect(mockPrisma.delivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: 'order-uuid-123',
            status: DeliveryStatus.PENDING_ASSIGNMENT,
          }),
        }),
      );
    });

    it('should throw if order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.createDelivery('non-existent', 'admin-uuid-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if order not confirmed', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PENDING_PAYMENT,
      });

      await expect(
        service.createDelivery('order-uuid-123', 'admin-uuid-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if delivery already exists', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        ...mockOrder,
        delivery: mockDelivery,
      });

      await expect(
        service.createDelivery('order-uuid-123', 'admin-uuid-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // assignDriver
  // ============================================
  describe('assignDriver()', () => {
    beforeEach(() => {
      mockPrisma.delivery.findUnique.mockResolvedValue({
        ...mockDelivery,
        status: DeliveryStatus.PENDING_ASSIGNMENT,
        driverId: null,
      });
      mockPrisma.driver.findUnique.mockResolvedValue(mockDriver);
      mockPrisma.delivery.update.mockResolvedValue({
        ...mockDelivery,
        status: DeliveryStatus.ASSIGNED,
      });
      mockPrisma.driver.update.mockResolvedValue({});
    });

    it('should assign driver successfully', async () => {
      const result = await service.assignDriver('delivery-uuid-123', {
        driverId: 'driver-uuid-123',
      });

      expect(result.status).toBe(DeliveryStatus.ASSIGNED);
      expect(mockPrisma.driver.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isAvailable: false },
        }),
      );
    });

    it('should throw if delivery not found', async () => {
      mockPrisma.delivery.findUnique.mockResolvedValue(null);

      await expect(
        service.assignDriver('non-existent', { driverId: 'driver-uuid-123' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if delivery not pending assignment', async () => {
      mockPrisma.delivery.findUnique.mockResolvedValue({
        ...mockDelivery,
        status: DeliveryStatus.ASSIGNED,
      });

      await expect(
        service.assignDriver('delivery-uuid-123', {
          driverId: 'driver-uuid-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if driver not available', async () => {
      mockPrisma.driver.findUnique.mockResolvedValue({
        ...mockDriver,
        isAvailable: false,
      });

      await expect(
        service.assignDriver('delivery-uuid-123', {
          driverId: 'driver-uuid-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================
  // updateStatus
  // ============================================
  describe('updateStatus()', () => {
    beforeEach(() => {
      mockPrisma.driver.findUnique.mockResolvedValue(mockDriver);
      mockPrisma.delivery.findUnique.mockResolvedValue(mockDelivery);
      mockPrisma.delivery.update.mockResolvedValue({
        ...mockDelivery,
        status: DeliveryStatus.PICKING_UP,
      });
      mockPrisma.order.update.mockResolvedValue({});
    });

    it('should update status ASSIGNED → PICKING_UP', async () => {
      await service.updateStatus(
        'delivery-uuid-123',
        'driver-user-uuid-123',
        DeliveryStatus.PICKING_UP,
      );

      expect(mockPrisma.delivery.update).toHaveBeenCalled();
    });

    it('should throw if invalid status transition', async () => {
      await expect(
        service.updateStatus(
          'delivery-uuid-123',
          'driver-user-uuid-123',
          DeliveryStatus.DELIVERED,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if driver not owner', async () => {
      mockPrisma.delivery.findUnique.mockResolvedValue({
        ...mockDelivery,
        driverId: 'other-driver-id',
      });

      await expect(
        service.updateStatus(
          'delivery-uuid-123',
          'driver-user-uuid-123',
          DeliveryStatus.PICKING_UP,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update order status when IN_TRANSIT', async () => {
      mockPrisma.delivery.findUnique.mockResolvedValue({
        ...mockDelivery,
        status: DeliveryStatus.PICKING_UP,
      });

      await service.updateStatus(
        'delivery-uuid-123',
        'driver-user-uuid-123',
        DeliveryStatus.IN_TRANSIT,
      );

      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: OrderStatus.SHIPPING },
        }),
      );
    });
  });

  // ============================================
  // updateLocation
  // ============================================
  describe('updateLocation()', () => {
    beforeEach(() => {
      mockPrisma.driver.findUnique.mockResolvedValue(mockDriver);
      mockPrisma.delivery.findUnique.mockResolvedValue(mockDelivery);
      mockPrisma.deliveryLocation.create.mockResolvedValue({});
      mockPrisma.driver.update.mockResolvedValue({});
    });

    it('should update location successfully', async () => {
      const result = await service.updateLocation(
        'delivery-uuid-123',
        'driver-user-uuid-123',
        { lat: 35.7, lng: 51.4 },
      );

      expect(result.message).toBe('موقعیت با موفقیت بروزرسانی شد');
      expect(mockPrisma.deliveryLocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lat: 35.7,
            lng: 51.4,
          }),
        }),
      );
    });

    it('should throw if not assigned driver', async () => {
      mockPrisma.delivery.findUnique.mockResolvedValue({
        ...mockDelivery,
        driverId: 'other-driver-id',
      });

      await expect(
        service.updateLocation('delivery-uuid-123', 'driver-user-uuid-123', {
          lat: 35.7,
          lng: 51.4,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================
  // confirmDelivery
  // ============================================
  describe('confirmDelivery()', () => {
    beforeEach(() => {
      mockPrisma.driver.findUnique.mockResolvedValue(mockDriver);
      mockPrisma.delivery.findUnique.mockResolvedValue({
        ...mockDelivery,
        status: DeliveryStatus.IN_TRANSIT,
      });
      mockPrisma.delivery.update.mockResolvedValue({});
      mockPrisma.order.update.mockResolvedValue({});
      mockPrisma.orderStatusHistory.create.mockResolvedValue({});
      mockPrisma.driver.update.mockResolvedValue({});
    });

    it('should confirm delivery successfully', async () => {
      const result = await service.confirmDelivery(
        'delivery-uuid-123',
        'driver-user-uuid-123',
        {
          proofImage: 'https://example.com/proof.jpg',
          recipientName: 'علی محمدی',
        },
      );

      expect(result.message).toBe('تحویل با موفقیت تأیید شد');
      expect(mockPrisma.driver.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isAvailable: true,
            ordersDelivered: { increment: 1 },
          }),
        }),
      );
    });

    it('should throw if delivery not IN_TRANSIT', async () => {
      mockPrisma.delivery.findUnique.mockResolvedValue({
        ...mockDelivery,
        status: DeliveryStatus.ASSIGNED,
      });

      await expect(
        service.confirmDelivery(
          'delivery-uuid-123',
          'driver-user-uuid-123',
          {},
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update order to DELIVERED', async () => {
      await service.confirmDelivery(
        'delivery-uuid-123',
        'driver-user-uuid-123',
        {},
      );

      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: OrderStatus.DELIVERED },
        }),
      );
    });
  });

  // ============================================
  // getMyDeliveries
  // ============================================
  describe('getMyDeliveries()', () => {
    it('should return driver deliveries', async () => {
      mockPrisma.driver.findUnique.mockResolvedValue(mockDriver);
      mockPrisma.delivery.findMany.mockResolvedValue([mockDelivery]);

      const result = await service.getMyDeliveries('driver-user-uuid-123');

      expect(result).toHaveLength(1);
    });

    it('should throw if driver not found', async () => {
      mockPrisma.driver.findUnique.mockResolvedValue(null);

      await expect(service.getMyDeliveries('non-driver-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
