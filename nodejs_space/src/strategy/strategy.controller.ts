import {
  Controller,
  Post,
  Body,
  Logger,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StrategyService, StrategyType } from './strategy.service.js';
import type { Response } from 'express';

@ApiTags('Strategy')
@Controller('api/strategy')
export class StrategyController {
  private readonly logger = new Logger(StrategyController.name);

  constructor(private strategyService: StrategyService) {}

  @Post('suggest')
  @ApiOperation({ summary: 'Suggest a strategy based on signal metrics' })
  @ApiResponse({ status: 200, description: 'Strategy suggestion' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  suggest(
    @Body()
    body: {
      symbol: string;
      atm_iv: number | null;
      vrp_20: number | null;
      vrp_percentile: number | null;
      iv_z: number | null;
      iv_z_percentile: number | null;
    },
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');

    if (!body.symbol) {
      throw new BadRequestException('symbol is required');
    }

    const suggestion = this.strategyService.suggestStrategy({
      symbol: body.symbol,
      atm_iv: body.atm_iv ?? null,
      vrp_20: body.vrp_20 ?? null,
      vrp_percentile: body.vrp_percentile ?? null,
      iv_z: body.iv_z ?? null,
      iv_z_percentile: body.iv_z_percentile ?? null,
    });

    this.logger.log(
      `Strategy suggested for ${body.symbol}: ${suggestion.strategy}`,
    );
    return suggestion;
  }

  @Post('calculate-legs')
  @ApiOperation({ summary: 'Calculate option legs for a strategy' })
  @ApiResponse({
    status: 200,
    description: 'Calculated legs with max loss and breakevens',
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  calculateLegs(
    @Body()
    body: {
      strategy: StrategyType;
      underlying_price: number;
      atm_iv: number;
      target_delta_short: number;
      target_delta_wing?: number;
      contracts?: number;
      estimated_credit?: number;
    },
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');

    const validStrategies: StrategyType[] = [
      'short_strangle',
      'iron_condor',
      'short_put',
    ];
    if (!validStrategies.includes(body.strategy)) {
      throw new BadRequestException(
        `strategy must be one of: ${validStrategies.join(', ')}`,
      );
    }
    if (!body.underlying_price || body.underlying_price <= 0) {
      throw new BadRequestException('underlying_price must be positive');
    }
    if (!body.atm_iv || body.atm_iv <= 0) {
      throw new BadRequestException('atm_iv must be positive');
    }
    if (
      !body.target_delta_short ||
      body.target_delta_short <= 0 ||
      body.target_delta_short >= 1
    ) {
      throw new BadRequestException(
        'target_delta_short must be between 0 and 1',
      );
    }

    const contracts = body.contracts ?? 1;
    const legs = this.strategyService.calculateLegs(
      body.strategy,
      body.underlying_price,
      body.atm_iv,
      body.target_delta_short,
      body.target_delta_wing,
    );

    const estimatedCredit = body.estimated_credit ?? 0;
    const maxLoss = this.strategyService.calculateMaxLoss(
      body.strategy,
      legs,
      estimatedCredit,
      contracts,
    );
    const breakevens = this.strategyService.calculateBreakevens(
      body.strategy,
      legs,
      estimatedCredit,
    );

    return {
      strategy: body.strategy,
      legs,
      contracts,
      max_loss: maxLoss,
      breakevens,
      estimated_credit: estimatedCredit,
    };
  }
}
