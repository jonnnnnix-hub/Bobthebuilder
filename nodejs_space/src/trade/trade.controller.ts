import { Controller, Post, Patch, Get, Body, Param, Query, Logger, Res, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { TradeService } from './trade.service.js';
import { parseIntegerQuery, parseEnumQuery } from '../common/query.utils.js';
import type { Response } from 'express';

@ApiTags('Trades')
@Controller('api/trades')
export class TradeController {
  private readonly logger = new Logger(TradeController.name);

  constructor(private tradeService: TradeService) {}

  @Post()
  @ApiOperation({ summary: 'Create trade from signal' })
  @ApiResponse({ status: 201, description: 'Trade created' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Signal not found' })
  async createTrade(
    @Body() body: { signal_id: number; contracts?: number; notes?: string },
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');

    if (!body.signal_id || typeof body.signal_id !== 'number') {
      throw new BadRequestException('signal_id is required and must be a number');
    }

    return this.tradeService.createTradeFromSignal({
      signal_id: body.signal_id,
      contracts: body.contracts,
      notes: body.notes,
    });
  }

  @Patch(':id/open')
  @ApiOperation({ summary: 'Open a pending trade' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Trade opened' })
  async openTrade(
    @Param('id') id: string,
    @Body() body: { entry_credit?: number },
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');
    const tradeId = this.parseTradeId(id);
    return this.tradeService.openTrade(tradeId, body?.entry_credit);
  }

  @Patch(':id/close')
  @ApiOperation({ summary: 'Close an open trade' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Trade closed' })
  async closeTrade(
    @Param('id') id: string,
    @Body() body: { exit_debit?: number },
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');
    const tradeId = this.parseTradeId(id);
    return this.tradeService.closeTrade(tradeId, body?.exit_debit);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a trade' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Trade cancelled' })
  async cancelTrade(
    @Param('id') id: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');
    const tradeId = this.parseTradeId(id);
    return this.tradeService.cancelTrade(tradeId);
  }

  @Get()
  @ApiOperation({ summary: 'Get trade history' })
  @ApiQuery({ name: 'symbol', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'open', 'closing', 'closed', 'expired', 'cancelled'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated trade list' })
  async getTrades(
    @Query('symbol') symbol?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');

    const validStatus = parseEnumQuery(status, 'status', [
      'pending', 'open', 'closing', 'closed', 'expired', 'cancelled',
    ] as const);

    return this.tradeService.getTradeHistory({
      symbol,
      status: validStatus,
      page: parseIntegerQuery(page, 'page', 1, { min: 1 }),
      limit: parseIntegerQuery(limit, 'limit', 20, { min: 1, max: 100 }),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get trade by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Trade details' })
  @ApiResponse({ status: 404, description: 'Trade not found' })
  async getTradeById(
    @Param('id') id: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');
    const tradeId = this.parseTradeId(id);
    return this.tradeService.getTradeById(tradeId);
  }

  private parseTradeId(id: string): number {
    const parsed = Number.parseInt(id, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new BadRequestException('id must be a positive integer');
    }
    return parsed;
  }
}
