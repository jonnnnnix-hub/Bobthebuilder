import { Controller, Post, Get, Body, Headers, Logger, Res, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { RiskService } from './risk.service.js';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

@ApiTags('Risk')
@Controller('api/risk')
export class RiskController {
  private readonly logger = new Logger(RiskController.name);

  constructor(
    private riskService: RiskService,
    private configService: ConfigService,
  ) {}

  @Get('report')
  @ApiOperation({ summary: 'Get latest risk report', description: 'Returns recent trade and portfolio risk checks.' })
  @ApiResponse({ status: 200, description: 'Risk report' })
  async getReport(@Res({ passthrough: true }) res?: Response) {
    res?.setHeader('Cache-Control', 'no-store');
    return this.riskService.getLatestRiskReport();
  }

  @Post('evaluate')
  @ApiOperation({ summary: 'Evaluate portfolio risk', description: 'Runs portfolio-level risk checks. API key protected.' })
  @ApiHeader({ name: 'x-api-key', required: true, description: 'API key for automated triggers' })
  @ApiResponse({ status: 200, description: 'Portfolio risk evaluation' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async evaluate(
    @Headers('x-api-key') apiKey?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');

    const cronKey = this.configService.get<string>('CRON_API_KEY');
    if (!apiKey || apiKey !== cronKey) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.riskService.evaluatePortfolioRisk();
  }
}
