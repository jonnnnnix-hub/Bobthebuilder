import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('Health')
@Controller('api')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private prisma: PrismaService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Health check',
    description: 'Returns service health status and database connectivity',
  })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async healthCheck() {
    if (!this.prisma.isConnected()) {
      return {
        status: 'ok',
        service: 'bob-volatility-signal-generator',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        database: 'error',
        last_run: null,
      };
    }

    let dbStatus = 'disconnected';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'error';
    }

    const latestRun = await this.prisma.analysis_run
      .findFirst({
        where: { status: 'completed' },
        orderBy: { started_at: 'desc' },
        select: { run_id: true, started_at: true, signals_generated: true },
      })
      .catch(() => null);

    return {
      status: 'ok',
      service: 'bob-volatility-signal-generator',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      last_run: latestRun,
    };
  }
}
