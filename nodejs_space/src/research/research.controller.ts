import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { parseBooleanQuery, parseDateQuery, parseIntegerQuery } from '../common/query.utils.js';
import { ResearchService } from './research.service.js';

@ApiTags('Research')
@Controller('api/research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Get('backtest')
  @ApiOperation({
    summary: 'Backtest persisted signals against real stored market bars',
    description: 'Uses next-trading-day open as entry and horizon-day close as exit. Only persisted signal and market_bar data are used.',
  })
  @ApiQuery({ name: 'run_id', required: false, type: String, description: 'Limit backtest to a single analysis run' })
  @ApiQuery({ name: 'symbol', required: false, type: String, description: 'Limit backtest to one symbol' })
  @ApiQuery({ name: 'selected_only', required: false, type: Boolean, description: 'Only evaluate selected signals (default true)' })
  @ApiQuery({ name: 'from_date', required: false, type: String, description: 'Signal start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to_date', required: false, type: String, description: 'Signal end date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'horizon_days', required: false, type: Number, description: 'Holding horizon in trading days (default 5)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum trades to return (default 100)' })
  @ApiResponse({ status: 200, description: 'Backtest summary and trade-level outcomes' })
  async backtestSignals(
    @Query('run_id') runId?: string,
    @Query('symbol') symbol?: string,
    @Query('selected_only') selectedOnly?: string,
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
    @Query('horizon_days') horizonDays?: string,
    @Query('limit') limit?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');

    const selectedOnlyValue = parseBooleanQuery(selectedOnly, 'selected_only') ?? true;
    const parsedFromDate = parseDateQuery(fromDate, 'from_date');
    const parsedToDate = parseDateQuery(toDate, 'to_date');
    const horizon = parseIntegerQuery(horizonDays, 'horizon_days', 5, { min: 1, max: 30 });
    const take = parseIntegerQuery(limit, 'limit', 100, { min: 1, max: 500 });

    if (parsedFromDate && parsedToDate && parsedFromDate.getTime() > parsedToDate.getTime()) {
      throw new BadRequestException('from_date must be earlier than or equal to to_date');
    }

    return this.researchService.backtestSignals({
      runId,
      symbol: symbol?.trim().toUpperCase(),
      selectedOnly: selectedOnlyValue,
      fromDate: parsedFromDate,
      toDate: parsedToDate,
      horizonDays: horizon,
      limit: take,
    });
  }
}
