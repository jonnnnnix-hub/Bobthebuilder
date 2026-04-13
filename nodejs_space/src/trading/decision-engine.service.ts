import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AlpacaService } from '../alpaca/alpaca.service.js';
import type { StrategySelection } from '../alpaca/alpaca.types.js';
import type {
  ExpirationSelectionResult,
  PositionSizingResult,
  StrikeSelectionResult,
  TradingDecision,
} from './trading.types.js';

@Injectable()
export class DecisionEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alpacaService: AlpacaService,
  ) {}

  async buildDecision(signalId: number): Promise<TradingDecision | null> {
    const signal = await this.prisma.signal.findUnique({
      where: { id: signalId },
    });
    if (!signal || !signal.selected) return null;

    const options = await this.prisma.option_chain_snapshot.findMany({
      where: { underlying_symbol: signal.symbol },
      orderBy: { snapshot_ts: 'desc' },
      take: 250,
    });

    const strategy = this.selectStrategy(signal);
    const expirationSelection = this.selectExpiration(signal, options);
    const strikeSelection = this.selectStrikes(
      strategy,
      signal,
      options,
      expirationSelection,
    );

    const account = await this.alpacaService.getAccount();
    const sizing = this.sizePosition(signal, account);

    const decision = {
      signalId: signal.id,
      symbol: signal.symbol,
      strategy,
      strikeSelection,
      expirationSelection,
      positionSizing: sizing,
      marketRegime: this.marketRegime(signal),
      volatilityEnvironment: this.volEnvironment(signal),
      compositeScore: signal.composite_score_normalized ?? 0,
      scoreConfidence: signal.score_confidence ?? 0,
      rationale: {
        categoryScores: signal.category_scores,
        ivZ: signal.iv_z,
        vrp: signal.vrp_20,
      },
    } satisfies TradingDecision;

    return decision;
  }

  private selectStrategy(signal: {
    iv_z: number | null;
    vrp_20: number | null;
    category_scores: unknown;
  }): StrategySelection {
    const ivz = signal.iv_z ?? 0;
    const vrp = signal.vrp_20 ?? 0;
    const categoryScores =
      signal.category_scores && typeof signal.category_scores === 'object'
        ? (signal.category_scores as Record<string, unknown>)
        : {};

    const skewScore = Number(
      this.readNested(categoryScores, 'skew.score') ?? 0,
    );
    const termScore = Number(
      this.readNested(categoryScores, 'term.score') ?? 0,
    );

    const scores: Record<StrategySelection['strategy'], number> = {
      long_call: Math.max(0, ivz * 20 + Math.max(0, 8 - vrp * 10)),
      long_put: Math.max(0, ivz * 12 + skewScore * 0.6),
      short_call: Math.max(0, vrp * 30 + termScore * 0.4),
      short_put: Math.max(0, vrp * 30 + Math.max(0, 20 - ivz * 5)),
      straddle: Math.max(0, ivz * 18 + termScore * 0.5),
      strangle: Math.max(0, ivz * 15 + skewScore * 0.4 + termScore * 0.3),
    };

    const selected = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return {
      strategy: selected[0] as StrategySelection['strategy'],
      score: Number(selected[1].toFixed(3)),
      breakdown: {
        ivz,
        vrp,
        skewScore,
        termScore,
      },
    };
  }

  private selectExpiration(
    signal: { category_scores: unknown; score_confidence: number | null },
    options: Array<{
      expiration: Date;
      open_interest: number | null;
      volume: number | null;
    }>,
  ): ExpirationSelectionResult {
    const byExpiration = new Map<
      string,
      { oi: number; volume: number; dte: number }
    >();
    const now = Date.now();
    for (const option of options) {
      const key = option.expiration.toISOString().slice(0, 10);
      const dte = Math.max(
        1,
        Math.round((option.expiration.getTime() - now) / (1000 * 60 * 60 * 24)),
      );
      const current = byExpiration.get(key) ?? { oi: 0, volume: 0, dte };
      current.oi += option.open_interest ?? 0;
      current.volume += option.volume ?? 0;
      byExpiration.set(key, current);
    }

    const termScore = Number(
      this.readNested(
        (signal.category_scores as Record<string, unknown>) ?? {},
        'term.score',
      ) ?? 0,
    );

    const targetDte = termScore > 20 ? 21 : termScore > 12 ? 30 : 45;
    const ranked = [...byExpiration.entries()].sort((a, b) => {
      const scoreA = this.expirationLiquidityScore(a[1], targetDte);
      const scoreB = this.expirationLiquidityScore(b[1], targetDte);
      return scoreB - scoreA;
    });

    const top = ranked[0];
    if (!top) {
      const fallbackDte = targetDte;
      const expiry = new Date(Date.now() + fallbackDte * 86400000)
        .toISOString()
        .slice(0, 10);
      return {
        expiration: expiry,
        dte: fallbackDte,
        thetaEfficiency: Number((100 / fallbackDte).toFixed(4)),
        liquidityScore: 0,
        rationale: 'Fallback expiration due to limited chain liquidity data',
      };
    }

    const liquidity = this.expirationLiquidityScore(top[1], targetDte);
    return {
      expiration: top[0],
      dte: top[1].dte,
      thetaEfficiency: Number((100 / Math.max(1, top[1].dte)).toFixed(4)),
      liquidityScore: Number(liquidity.toFixed(4)),
      rationale: `Selected expiry closest to ${targetDte} DTE with strongest OI/volume`,
    };
  }

  private selectStrikes(
    strategy: StrategySelection,
    signal: { symbol: string; score_confidence: number | null },
    options: Array<{
      expiration: Date;
      strike: import('@prisma/client/runtime/library').Decimal;
      option_type: string;
      delta: import('@prisma/client/runtime/library').Decimal | null;
      bid: import('@prisma/client/runtime/library').Decimal | null;
      ask: import('@prisma/client/runtime/library').Decimal | null;
    }>,
    expiration: ExpirationSelectionResult,
  ): StrikeSelectionResult {
    const filtered = options.filter(
      (q) => q.expiration.toISOString().slice(0, 10) === expiration.expiration,
    );

    const confidence = signal.score_confidence ?? 0.5;
    const targetDelta = strategy.strategy.includes('short')
      ? 0.2 + (1 - confidence) * 0.1
      : 0.35 + confidence * 0.15;

    const call = this.bestQuote(filtered, 'call', targetDelta);
    const put = this.bestQuote(filtered, 'put', -targetDelta);

    const spreadScore = this.liquidityFromQuotes(
      call?.spread ?? null,
      put?.spread ?? null,
    );

    return {
      shortStrike: strategy.strategy.includes('short')
        ? strategy.strategy.includes('put')
          ? put?.strike
          : call?.strike
        : undefined,
      longStrike: strategy.strategy.includes('strangle')
        ? undefined
        : strategy.strategy.includes('long')
          ? strategy.strategy.includes('put')
            ? put?.strike
            : call?.strike
          : undefined,
      callStrike:
        strategy.strategy === 'straddle' || strategy.strategy === 'strangle'
          ? call?.strike
          : undefined,
      putStrike:
        strategy.strategy === 'straddle' || strategy.strategy === 'strangle'
          ? put?.strike
          : undefined,
      expiration: expiration.expiration,
      dte: expiration.dte,
      liquidityScore: spreadScore,
      rationale: `Target delta ${targetDelta.toFixed(2)} with spread-aware liquidity optimization`,
    };
  }

  private sizePosition(
    signal: {
      composite_score_normalized: number | null;
      score_confidence: number | null;
    },
    account: Record<string, unknown>,
  ): PositionSizingResult {
    const equity = Number(account.equity ?? 100000);
    const normalized =
      Math.max(0, signal.composite_score_normalized ?? 0) / 100;
    const confidence = Math.max(
      0.2,
      Math.min(1.4, signal.score_confidence ?? 0.6),
    );
    const baseRiskPct = 0.005 + normalized * 0.02;
    const notional = equity * baseRiskPct * confidence;
    const contracts = Math.max(1, Math.floor(notional / 1500));

    return {
      notionalUsd: Number(notional.toFixed(2)),
      contracts,
      heatContributionPct: Number((baseRiskPct * 100).toFixed(3)),
      confidenceMultiplier: Number(confidence.toFixed(3)),
      rationale:
        'Composite-score-weighted notional with confidence and portfolio heat scaling',
    };
  }

  private bestQuote(
    quotes: Array<{
      strike: import('@prisma/client/runtime/library').Decimal;
      option_type: string;
      delta: import('@prisma/client/runtime/library').Decimal | null;
      bid: import('@prisma/client/runtime/library').Decimal | null;
      ask: import('@prisma/client/runtime/library').Decimal | null;
    }>,
    type: 'call' | 'put',
    targetDelta: number,
  ): { strike: number; spread: number } | null {
    const candidates = quotes
      .filter((q) => q.option_type === type)
      .map((q) => {
        const delta = Number(q.delta ?? 0);
        const bid = Number(q.bid ?? 0);
        const ask = Number(q.ask ?? 0);
        const spread = ask > 0 ? (ask - bid) / ask : 1;
        return {
          strike: Number(q.strike),
          distance: Math.abs(delta - targetDelta),
          spread,
          score: Math.abs(delta - targetDelta) + spread * 0.8,
        };
      })
      .sort((a, b) => a.score - b.score);

    return candidates[0] ?? null;
  }

  private marketRegime(signal: {
    hv_20: number | null;
    hv_60: number | null;
  }): string {
    const hv20 = signal.hv_20 ?? 0;
    const hv60 = signal.hv_60 ?? 0;
    if (hv20 > hv60 * 1.2) return 'high-vol-trending';
    if (hv20 < hv60 * 0.8) return 'low-vol-range';
    return 'balanced';
  }

  private volEnvironment(signal: {
    iv_z: number | null;
    vrp_20: number | null;
  }): string {
    const ivz = signal.iv_z ?? 0;
    const vrp = signal.vrp_20 ?? 0;
    if (ivz >= 2 && vrp > 0) return 'elevated-rich-vol';
    if (ivz < 0.5 && vrp < 0) return 'compressed-cheap-vol';
    return 'neutral-vol';
  }

  private expirationLiquidityScore(
    point: { oi: number; volume: number; dte: number },
    targetDte: number,
  ): number {
    const dtePenalty = Math.abs(point.dte - targetDte) / Math.max(1, targetDte);
    const liq = Math.log10(1 + point.oi + point.volume);
    return liq - dtePenalty;
  }

  private liquidityFromQuotes(...spreads: Array<number | null>): number {
    const valid = spreads.filter(
      (s): s is number => s != null && Number.isFinite(s),
    );
    if (!valid.length) return 0;
    const avg = valid.reduce((sum, value) => sum + value, 0) / valid.length;
    return Number(Math.max(0, 1 - avg).toFixed(4));
  }

  private readNested(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
      if (
        acc &&
        typeof acc === 'object' &&
        key in (acc as Record<string, unknown>)
      ) {
        return (acc as Record<string, unknown>)[key];
      }
      return null;
    }, obj);
  }
}
