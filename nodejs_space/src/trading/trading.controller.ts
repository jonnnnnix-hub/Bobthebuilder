import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { parseIntegerQuery } from '../common/query.utils.js';
import { TradingService } from './trading.service.js';

@ApiTags('trading')
@Controller('/api/trading')
export class TradingController {
  constructor(private readonly tradingService: TradingService) {}

  @Get('/positions')
  @ApiOperation({ summary: 'Current live positions with P&L and Greeks' })
  async getPositions(@Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await this.tradingService.getPositions());
  }

  @Get('/history')
  @ApiOperation({ summary: 'Trade history (orders/fills)' })
  async getHistory(
    @Query('limit') limit: string | undefined,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const parsed = parseIntegerQuery(limit, 'limit', 150, {
      min: 1,
      max: 1000,
    });
    return res.json(await this.tradingService.getHistory(parsed));
  }

  @Get('/portfolio')
  @ApiOperation({ summary: 'Portfolio analytics and performance curves' })
  async getPortfolio(@Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await this.tradingService.getPortfolioAnalytics());
  }

  @Get('/risk')
  @ApiOperation({ summary: 'Latest model-driven risk metrics' })
  async getRisk(@Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await this.tradingService.getRiskMetrics());
  }

  @Post('/manual-exit/:positionId')
  @ApiOperation({ summary: 'Manually force exit for a position' })
  async manualExit(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await this.tradingService.manualExit(BigInt(positionId)));
  }

  @Get('/logs')
  @ApiOperation({ summary: 'Autonomous execution logs' })
  async getLogs(
    @Query('limit') limit: string | undefined,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const parsed = parseIntegerQuery(limit, 'limit', 200, {
      min: 1,
      max: 2000,
    });
    return res.json(await this.tradingService.getExecutionLogs(parsed));
  }
}
