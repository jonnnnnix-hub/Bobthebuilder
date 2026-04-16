import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AccountSnapshot, TradingDecision } from './trading.types.js';

@Injectable()
export class AutonomousRiskService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(
    decision: TradingDecision,
    account?: AccountSnapshot,
  ): Promise<{
    approved: boolean;
    status: 'approved' | 'blocked';
    metrics: Record<string, number | string | null>;
    reasons: string[];
  }> {
    const latestPositions = await this.prisma.position_monitoring.findMany({
      orderBy: { last_synced_at: 'desc' },
      take: 200,
    });

    const latestBySymbol = new Map<string, (typeof latestPositions)[number]>();
    for (const p of latestPositions) {
      if (!latestBySymbol.has(p.symbol)) latestBySymbol.set(p.symbol, p);
    }

    const positions = [...latestBySymbol.values()];
    const totalExposure = positions.reduce(
      (sum, p) => sum + Number(p.market_value ?? 0),
      0,
    );
    const nextExposure = totalExposure + decision.positionSizing.notionalUsd;

    const symbolExposure =
      Number(latestBySymbol.get(decision.symbol)?.market_value ?? 0) +
      decision.positionSizing.notionalUsd;
    const symbolConcentration =
      nextExposure > 0 ? symbolExposure / nextExposure : 0;

    const greeks = positions.reduce(
      (acc, p) => {
        acc.delta += Number(p.delta ?? 0);
        acc.gamma += Number(p.gamma ?? 0);
        acc.theta += Number(p.theta ?? 0);
        acc.vega += Number(p.vega ?? 0);
        return acc;
      },
      { delta: 0, gamma: 0, theta: 0, vega: 0 },
    );

    const liquidityScore = Number(decision.strikeSelection.liquidityScore ?? 0);
    const var95 =
      nextExposure * 0.02 * (1.1 - Math.min(1, decision.scoreConfidence));
    const heat = decision.positionSizing.heatContributionPct / 100;

    const dynamicSymbolLimit = Math.max(
      0.12,
      0.35 - decision.scoreConfidence * 0.1,
    );
    const dynamicDeltaLimit = 250 * Math.max(0.7, 1 - heat);

    const reasons: string[] = [];
    if (symbolConcentration > dynamicSymbolLimit) {
      reasons.push(
        `symbol concentration ${symbolConcentration.toFixed(3)} exceeds dynamic limit ${dynamicSymbolLimit.toFixed(3)}`,
      );
    }
    if (Math.abs(greeks.delta) > dynamicDeltaLimit) {
      reasons.push(
        `portfolio delta ${greeks.delta.toFixed(2)} exceeds dynamic limit ${dynamicDeltaLimit.toFixed(2)}`,
      );
    }
    if (liquidityScore < 0.35) {
      reasons.push(
        `liquidity score ${liquidityScore.toFixed(3)} below minimum 0.350`,
      );
    }

    const maxDailyLossPct = Number(process.env.MAX_DAILY_LOSS_PCT ?? 0.03);
    let dailyChangePct: number | null = null;
    if (account && account.lastEquity && account.lastEquity > 0) {
      dailyChangePct = (account.equity - account.lastEquity) / account.lastEquity;
      if (dailyChangePct < -maxDailyLossPct) {
        reasons.push(
          `daily loss ${(dailyChangePct * 100).toFixed(2)}% exceeds limit ${(maxDailyLossPct * 100).toFixed(2)}%`,
        );
      }
    }
    if (account && account.status !== 'ACTIVE') {
      reasons.push(`account status "${account.status}" is not ACTIVE`);
    }

    await this.prisma.risk_metrics.create({
      data: {
        portfolio_value: nextExposure,
        var_95: var95,
        max_drawdown_pct: Math.min(0.5, heat * 2.4),
        portfolio_heat_pct: heat,
        max_symbol_concentration: symbolConcentration,
        max_sector_concentration: null,
        portfolio_delta: greeks.delta,
        portfolio_gamma: greeks.gamma,
        portfolio_theta: greeks.theta,
        portfolio_vega: greeks.vega,
        liquidity_score: liquidityScore,
        market_regime: decision.marketRegime,
        metrics_payload: {
          dynamicSymbolLimit,
          dynamicDeltaLimit,
          reasons,
          dailyChangePct,
          maxDailyLossPct,
        },
      },
    });

    return {
      approved: reasons.length === 0,
      status: reasons.length === 0 ? 'approved' : 'blocked',
      metrics: {
        symbolConcentration,
        dynamicSymbolLimit,
        portfolioDelta: greeks.delta,
        dynamicDeltaLimit,
        liquidityScore,
        var95,
      },
      reasons,
    };
  }
}
