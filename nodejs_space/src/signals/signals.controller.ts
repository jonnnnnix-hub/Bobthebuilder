import { BadRequestException, Controller, Get, Query, Logger, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Response } from 'express';
import { parseBooleanQuery, parseDateQuery, parseIntegerQuery } from '../common/query.utils.js';

@ApiTags('Signals')
@Controller('api/signals')
export class SignalsController {
  private readonly logger = new Logger(SignalsController.name);

  constructor(private prisma: PrismaService) {}

  @Get('latest')
  @ApiOperation({ summary: 'Get latest signals', description: 'Returns the top signals from the most recent completed analysis run' })
  @ApiQuery({ name: 'selected_only', required: false, type: Boolean, description: 'Only return selected (top) signals' })
  @ApiResponse({ status: 200, description: 'Latest signals' })
  async getLatest(
    @Query('selected_only') selectedOnly?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');
    const selectedOnlyValue = parseBooleanQuery(selectedOnly, 'selected_only');

    // Find the latest completed run
    const latestRun = await this.prisma.analysis_run.findFirst({
      where: { status: 'completed' },
      orderBy: { started_at: 'desc' },
    });

    if (!latestRun) {
      return { run: null, signals: [], message: 'No completed analysis runs found' };
    }

    const where: Record<string, unknown> = { run_id: latestRun.run_id };
    if (selectedOnlyValue) {
      where.selected = true;
    }

    const signals = await this.prisma.signal.findMany({
      where,
      orderBy: { rank: 'asc' },
      take: selectedOnlyValue ? undefined : 50,
    });

    return {
      run: {
        run_id: latestRun.run_id,
        date: latestRun.started_at,
        symbols_analyzed: latestRun.symbols_analyzed,
        signals_generated: latestRun.signals_generated,
      },
      signals,
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get signal history', description: 'Returns historical signals with pagination and filters' })
  @ApiQuery({ name: 'symbol', required: false, type: String, description: 'Filter by symbol' })
  @ApiQuery({ name: 'selected_only', required: false, type: Boolean, description: 'Only return selected signals' })
  @ApiQuery({ name: 'from_date', required: false, type: String, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to_date', required: false, type: String, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default 50, max 200)' })
  @ApiResponse({ status: 200, description: 'Signal history with pagination' })
  async getHistory(
    @Query('symbol') symbol?: string,
    @Query('selected_only') selectedOnly?: string,
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');

    const pageNum = parseIntegerQuery(page, 'page', 1, { min: 1 });
    const take = parseIntegerQuery(limit, 'limit', 50, { min: 1, max: 200 });
    const skip = (pageNum - 1) * take;
    const selectedOnlyValue = parseBooleanQuery(selectedOnly, 'selected_only');
    const parsedFromDate = parseDateQuery(fromDate, 'from_date');
    const parsedToDate = parseDateQuery(toDate, 'to_date');

    if (parsedFromDate && parsedToDate && parsedFromDate > parsedToDate) {
      throw new BadRequestException('from_date must be earlier than or equal to to_date');
    }

    const where: Record<string, unknown> = {};
    if (symbol) where.symbol = symbol.toUpperCase();
    if (selectedOnlyValue) where.selected = true;
    if (parsedFromDate || parsedToDate) {
      where.date = {};
      if (parsedFromDate) (where.date as Record<string, Date>).gte = parsedFromDate;
      if (parsedToDate) (where.date as Record<string, Date>).lte = parsedToDate;
    }

    const [signals, total] = await Promise.all([
      this.prisma.signal.findMany({
        where,
        orderBy: [{ date: 'desc' }, { rank: 'asc' }],
        take,
        skip,
      }),
      this.prisma.signal.count({ where }),
    ]);

    return {
      signals,
      pagination: {
        page: pageNum,
        limit: take,
        total,
        total_pages: Math.ceil(total / take),
      },
    };
  }
}
