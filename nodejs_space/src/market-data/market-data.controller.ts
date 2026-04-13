import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Headers,
  Query,
  Res,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiHeader,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { parseDateQuery, parseIntegerQuery } from '../common/query.utils.js';
import { MarketDataService } from './market-data.service.js';

@ApiTags('Market Data')
@Controller('api/market')
export class MarketDataController {
  private readonly logger = new Logger(MarketDataController.name);

  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly configService: ConfigService,
  ) {}

  @Get('bars')
  @ApiOperation({
    summary: 'Get stored historical market bars',
    description:
      'Returns ingested daily OHLCV bars stored locally for a given symbol.',
  })
  @ApiQuery({ name: 'symbol', required: true, type: String })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description: 'Inclusive start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    description: 'Inclusive end date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum rows to return (default 50)',
  })
  @ApiResponse({ status: 200, description: 'Stored market bars' })
  async getBars(
    @Query('symbol') symbol?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');

    const normalizedSymbol = symbol?.trim().toUpperCase();
    if (!normalizedSymbol) {
      throw new BadRequestException('symbol is required');
    }

    const fromDate = parseDateQuery(from, 'from');
    const toDate = parseDateQuery(to, 'to');
    const take = parseIntegerQuery(limit, 'limit', 50, { min: 1, max: 250 });

    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('from must be on or before to');
    }

    const bars = await this.marketDataService.listBars({
      symbol: normalizedSymbol,
      from: fromDate,
      to: toDate,
      limit: take,
    });

    return bars.map((bar) => ({
      symbol: bar.symbol,
      date: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume.toString(),
      transactions: bar.transactions?.toString() ?? null,
      source: bar.source,
    }));
  }

  @Get('ingestion/runs')
  @ApiOperation({
    summary: 'Get market-data ingestion runs',
    description: 'Returns the most recent local flat-file ingestion attempts.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum runs to return (default 20)',
  })
  @ApiResponse({ status: 200, description: 'Market-data ingestion runs' })
  async getIngestionRuns(
    @Query('limit') limit?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');
    const take = parseIntegerQuery(limit, 'limit', 20, { min: 1, max: 100 });
    return this.marketDataService.listIngestionRuns(take);
  }

  @Get('coverage')
  @ApiOperation({
    summary: 'Get local market-data coverage',
    description:
      'Returns local historical bar coverage for the active universe within a date range.',
  })
  @ApiQuery({
    name: 'from',
    required: true,
    type: String,
    description: 'Inclusive start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    type: String,
    description: 'Inclusive end date (YYYY-MM-DD)',
  })
  @ApiResponse({
    status: 200,
    description: 'Local market-data coverage summary',
  })
  async getCoverage(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');

    const fromDate = parseDateQuery(from, 'from');
    const toDate = parseDateQuery(to, 'to');
    if (!fromDate || !toDate) {
      throw new BadRequestException('from and to are required');
    }

    return this.marketDataService.getCoverage({
      from: fromDate,
      to: toDate,
    });
  }

  @Post('ingest')
  @ApiOperation({
    summary: 'Ingest day aggregates',
    description:
      'Ingests Polygon flat-file day aggregates for the previous trading day. Requires API key.',
  })
  @ApiHeader({
    name: 'x-api-key',
    required: true,
    description: 'API key for automated triggers',
  })
  @ApiResponse({ status: 200, description: 'Ingestion result' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async ingest(@Headers('x-api-key') apiKey?: string) {
    const cronKey = this.configService.get<string>('CRON_API_KEY');
    if (!apiKey || apiKey !== cronKey) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    this.logger.log('Market data ingestion triggered via API');
    return this.marketDataService.ingestDayAggregates(undefined, 'cron');
  }
}
