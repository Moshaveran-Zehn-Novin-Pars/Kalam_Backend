import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
    HealthCheck,
    HealthCheckService,
    MemoryHealthIndicator,
    DiskHealthIndicator,
} from '@nestjs/terminus';

@ApiTags('Health')
@Controller('health')
export class HealthController {
    constructor(
        private readonly health: HealthCheckService,
        private readonly memory: MemoryHealthIndicator,
        private readonly disk: DiskHealthIndicator,
    ) {}

    @Get()
    @HealthCheck()
    @ApiOperation({ summary: 'Check API health status' })
    check() {
        // Windows path fix: use drive letter instead of '/'
        const diskPath = process.platform === 'win32' ? 'D:\\' : '/';

        return this.health.check([
            () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
            () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
            () =>
                this.disk.checkStorage('disk_storage', {
                    path: diskPath,
                    thresholdPercent: 0.9,
                }),
        ]);
    }

    @Get('ping')
    @ApiOperation({ summary: 'Simple ping endpoint' })
    ping() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'kalam-backend',
        };
    }
}