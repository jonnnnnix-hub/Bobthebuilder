import { Controller, Post, Get, Param, Headers, Logger, Res, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiParam } from '@nestjs/swagger';
import { PositionService } from './position.service.js';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

@ApiTags('Positions')
@Controller('api/positions')
export class PositionController {
  private readonly logger = new Logger(PositionController.name);

  constructor(
    private positionService: PositionService,
    private configService: ConfigService,
  ) {}

  @Post('snapshot')
  @ApiOperation({ summary: 'Snapshot all open positions', description: 'Fetches current prices and creates position snapshots. API key protected.' })
  @ApiHeader({ name: 'x-api-key', required: true, description: 'API key for automated triggers' })
  @ApiResponse({ status: 200, description: 'Snapshot results' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async snapshot(
    @Headers('x-api-key') apiKey?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');

    const cronKey = this.configService.get<string>('CRON_API_KEY');
    if (!apiKey || apiKey !== cronKey) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.positionService.snapshotAllOpenPositions();
  }

  @Get('portfolio')
  @ApiOperation({ summary: 'Get portfolio summary', description: 'Returns total P&L, net delta, total theta, and all open positions.' })
  @ApiResponse({ status: 200, description: 'Portfolio summary' })
  async getPortfolio(@Res({ passthrough: true }) res?: Response) {
    res?.setHeader('Cache-Control', 'no-store');
    return this.positionService.getPortfolioSummary();
  }

  @Get(':tradeId/timeline')
  @ApiOperation({ summary: 'Get position timeline for a trade' })
  @ApiParam({ name: 'tradeId', type: Number })
  @ApiResponse({ status: 200, description: 'Position snapshots over time' })
  async getTimeline(
    @Param('tradeId') tradeId: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');

    const id = Number.parseInt(tradeId, 10);
    if (Number.isNaN(id) || id <= 0) {
      throw new BadRequestException('tradeId must be a positive integer');
    }

    return this.positionService.getPositionTimeline(id);
  }
}
