import { Controller, Get, Query, Logger, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Response } from 'express';
import { parseBooleanQuery } from '../common/query.utils.js';

type SectorGroup = {
  sector: string | null;
  _count: {
    symbol: number;
  };
};

type SectorSummary = {
  sector: string;
  count: number;
};

@ApiTags('Universe')
@Controller('api/universe')
export class UniverseController {
  private readonly logger = new Logger(UniverseController.name);

  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Get symbol universe',
    description: 'Returns the list of tracked symbols',
  })
  @ApiQuery({
    name: 'active_only',
    required: false,
    type: Boolean,
    description: 'Only return active symbols (default true)',
  })
  @ApiQuery({
    name: 'sector',
    required: false,
    type: String,
    description: 'Filter by sector',
  })
  @ApiResponse({ status: 200, description: 'Symbol universe list' })
  async getUniverse(
    @Query('active_only') activeOnly?: string,
    @Query('sector') sector?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');

    const where: Record<string, unknown> = {};
    const activeOnlyValue = parseBooleanQuery(activeOnly, 'active_only');
    if (activeOnlyValue !== false) where.active = true;
    if (sector) where.sector = sector;

    const symbols = await this.prisma.universe.findMany({
      where,
      orderBy: { symbol: 'asc' },
    });

    const sectors = await this.prisma.universe.groupBy({
      by: ['sector'],
      _count: { symbol: true },
      where: { active: true },
    });

    return {
      total: symbols.length,
      sectors: sectors
        .filter(
          (entry: SectorGroup): entry is SectorGroup & { sector: string } =>
            Boolean(entry.sector),
        )
        .map(
          (entry: SectorGroup & { sector: string }): SectorSummary => ({
            sector: entry.sector,
            count: entry._count.symbol,
          }),
        )
        .sort(
          (left: SectorSummary, right: SectorSummary) =>
            right.count - left.count,
        ),
      symbols,
    };
  }
}
