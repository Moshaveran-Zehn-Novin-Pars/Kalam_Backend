import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import {
  HealthCheckService,
  MemoryHealthIndicator,
  DiskHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: jest.Mocked<HealthCheckService>;

  beforeEach(async () => {
    const mockHealthCheckService = {
      check: jest.fn().mockResolvedValue({ status: 'ok' }),
    };

    const mockMemory = {
      checkHeap: jest.fn(),
      checkRSS: jest.fn(),
    };

    const mockDisk = {
      checkStorage: jest.fn(),
    };

    const mockPrismaHealth = {
      pingCheck: jest.fn(),
    };

    const mockPrisma = {
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        { provide: MemoryHealthIndicator, useValue: mockMemory },
        { provide: DiskHealthIndicator, useValue: mockDisk },
        { provide: PrismaHealthIndicator, useValue: mockPrismaHealth },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get(HealthCheckService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check()', () => {
    it('should return health status', async () => {
      const result = await controller.check();
      expect(result).toEqual({ status: 'ok' });
      expect(healthCheckService.check).toHaveBeenCalled();
    });
  });

  describe('ping()', () => {
    it('should return ping response', () => {
      const result = controller.ping();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('kalam-backend');
      expect(result.timestamp).toBeDefined();
    });
  });
});
