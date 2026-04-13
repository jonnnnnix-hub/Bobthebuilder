import { Injectable, Logger, BadRequestException } from '@nestjs/common';

export type StrategyType = 'short_strangle' | 'iron_condor' | 'short_put';

export interface StrategySuggestion {
  strategy: StrategyType;
  reason: string;
  target_delta_short: number;
  target_delta_wing?: number;
}

export interface LegDefinition {
  option_type: 'call' | 'put';
  strike: number;
  side: 'sell' | 'buy';
  delta: number;
}

export interface StrategyLegs {
  strategy: StrategyType;
  legs: LegDefinition[];
  max_loss: number;
  breakevens: { lower: number; upper?: number };
  estimated_credit: number;
}

export interface SignalInput {
  symbol: string;
  atm_iv: number | null;
  vrp_20: number | null;
  vrp_percentile: number | null;
  iv_z: number | null;
  iv_z_percentile: number | null;
}

@Injectable()
export class StrategyService {
  private readonly logger = new Logger(StrategyService.name);

  suggestStrategy(signal: SignalInput): StrategySuggestion {
    const vrpPct = signal.vrp_percentile ?? 0;
    const ivZPct = signal.iv_z_percentile ?? 0;

    // VRP very high (>= 95) + IV high (>= 90) → short strangle at 16 delta
    if (vrpPct >= 95 && ivZPct >= 90) {
      return {
        strategy: 'short_strangle',
        reason: `VRP very high (${vrpPct.toFixed(1)}th pct) + IV high (${ivZPct.toFixed(1)}th pct) — sell both sides`,
        target_delta_short: 0.16,
      };
    }

    // VRP high (>= 80) + IV very high (>= 95) → iron condor with 16/5 delta
    if (vrpPct >= 80 && ivZPct >= 95) {
      return {
        strategy: 'iron_condor',
        reason: `VRP high (${vrpPct.toFixed(1)}th pct) + IV very high (${ivZPct.toFixed(1)}th pct) — defined risk spread`,
        target_delta_short: 0.16,
        target_delta_wing: 0.05,
      };
    }

    // VRP high (>= 80) + IV moderate (>= 70) → short put at 20 delta
    if (vrpPct >= 80 && ivZPct >= 70) {
      return {
        strategy: 'short_put',
        reason: `VRP high (${vrpPct.toFixed(1)}th pct) + IV moderate (${ivZPct.toFixed(1)}th pct) — sell puts only`,
        target_delta_short: 0.2,
      };
    }

    // Default: short put at 20 delta for any qualifying signal
    return {
      strategy: 'short_put',
      reason: `Default strategy — VRP ${vrpPct.toFixed(1)}th pct, IV ${ivZPct.toFixed(1)}th pct`,
      target_delta_short: 0.2,
    };
  }

  calculateLegs(
    strategy: StrategyType,
    underlyingPrice: number,
    atmIv: number,
    targetDeltaShort: number,
    targetDeltaWing?: number,
  ): LegDefinition[] {
    if (underlyingPrice <= 0) {
      throw new BadRequestException('underlyingPrice must be positive');
    }
    if (atmIv <= 0) {
      throw new BadRequestException('atmIv must be positive');
    }

    const putStrike = this.estimateStrikeFromDelta(
      underlyingPrice,
      atmIv,
      targetDeltaShort,
      'put',
    );
    const callStrike = this.estimateStrikeFromDelta(
      underlyingPrice,
      atmIv,
      targetDeltaShort,
      'call',
    );

    switch (strategy) {
      case 'short_put':
        return [
          {
            option_type: 'put',
            strike: putStrike,
            side: 'sell',
            delta: -targetDeltaShort,
          },
        ];

      case 'short_strangle':
        return [
          {
            option_type: 'put',
            strike: putStrike,
            side: 'sell',
            delta: -targetDeltaShort,
          },
          {
            option_type: 'call',
            strike: callStrike,
            side: 'sell',
            delta: targetDeltaShort,
          },
        ];

      case 'iron_condor': {
        const wingDelta = targetDeltaWing ?? 0.05;
        const putWingStrike = this.estimateStrikeFromDelta(
          underlyingPrice,
          atmIv,
          wingDelta,
          'put',
        );
        const callWingStrike = this.estimateStrikeFromDelta(
          underlyingPrice,
          atmIv,
          wingDelta,
          'call',
        );
        return [
          {
            option_type: 'put',
            strike: putWingStrike,
            side: 'buy',
            delta: -wingDelta,
          },
          {
            option_type: 'put',
            strike: putStrike,
            side: 'sell',
            delta: -targetDeltaShort,
          },
          {
            option_type: 'call',
            strike: callStrike,
            side: 'sell',
            delta: targetDeltaShort,
          },
          {
            option_type: 'call',
            strike: callWingStrike,
            side: 'buy',
            delta: wingDelta,
          },
        ];
      }
    }
  }

  calculateMaxLoss(
    strategy: StrategyType,
    legs: LegDefinition[],
    estimatedCredit: number,
    contracts: number,
  ): number {
    const multiplier = contracts * 100;

    switch (strategy) {
      case 'short_put': {
        const putLeg = legs.find(
          (l) => l.option_type === 'put' && l.side === 'sell',
        );
        if (!putLeg) return 0;
        return (putLeg.strike - estimatedCredit) * multiplier;
      }
      case 'short_strangle': {
        // Undefined max loss (naked) — approximate as underlying going to 0 on put side
        const putLeg = legs.find(
          (l) => l.option_type === 'put' && l.side === 'sell',
        );
        if (!putLeg) return 0;
        return (putLeg.strike - estimatedCredit) * multiplier;
      }
      case 'iron_condor': {
        const shortPut = legs.find(
          (l) => l.option_type === 'put' && l.side === 'sell',
        );
        const longPut = legs.find(
          (l) => l.option_type === 'put' && l.side === 'buy',
        );
        if (!shortPut || !longPut) return 0;
        const wingWidth = Math.abs(shortPut.strike - longPut.strike);
        return (wingWidth - estimatedCredit) * multiplier;
      }
    }
  }

  calculateBreakevens(
    strategy: StrategyType,
    legs: LegDefinition[],
    estimatedCredit: number,
  ): { lower: number; upper?: number } {
    switch (strategy) {
      case 'short_put': {
        const putLeg = legs.find(
          (l) => l.option_type === 'put' && l.side === 'sell',
        );
        return { lower: (putLeg?.strike ?? 0) - estimatedCredit };
      }
      case 'short_strangle': {
        const putLeg = legs.find(
          (l) => l.option_type === 'put' && l.side === 'sell',
        );
        const callLeg = legs.find(
          (l) => l.option_type === 'call' && l.side === 'sell',
        );
        return {
          lower: (putLeg?.strike ?? 0) - estimatedCredit,
          upper: (callLeg?.strike ?? 0) + estimatedCredit,
        };
      }
      case 'iron_condor': {
        const shortPut = legs.find(
          (l) => l.option_type === 'put' && l.side === 'sell',
        );
        const shortCall = legs.find(
          (l) => l.option_type === 'call' && l.side === 'sell',
        );
        return {
          lower: (shortPut?.strike ?? 0) - estimatedCredit,
          upper: (shortCall?.strike ?? 0) + estimatedCredit,
        };
      }
    }
  }

  /**
   * Approximate strike for a target delta using simplified Black-Scholes.
   * Uses 30-day expiry assumption, delta ≈ N(d1).
   */
  private estimateStrikeFromDelta(
    underlyingPrice: number,
    iv: number,
    targetDelta: number,
    optionType: 'call' | 'put',
  ): number {
    const t = 30 / 365;
    const sqrtT = Math.sqrt(t);

    // Inverse normal approximation (Beasley-Springer-Moro)
    const targetCdf = optionType === 'call' ? targetDelta : 1 - targetDelta;
    const z = this.inverseNormalCdf(targetCdf);

    // From d1 = z, solve for K:
    // d1 = [ln(S/K) + (σ²/2)·t] / (σ·√t)
    // K = S · exp(-(d1·σ·√t - (σ²/2)·t))
    const strike =
      underlyingPrice * Math.exp(-(z * iv * sqrtT - (iv * iv * t) / 2));

    return this.roundToStrikeIncrement(strike, underlyingPrice);
  }

  private roundToStrikeIncrement(
    strike: number,
    underlyingPrice: number,
  ): number {
    let increment: number;
    if (underlyingPrice < 50) {
      increment = 0.5;
    } else if (underlyingPrice < 200) {
      increment = 1;
    } else {
      increment = 5;
    }
    return Math.round(strike / increment) * increment;
  }

  private inverseNormalCdf(p: number): number {
    // Rational approximation (Abramowitz & Stegun 26.2.23)
    if (p <= 0) return -8;
    if (p >= 1) return 8;
    if (p === 0.5) return 0;

    const isLower = p < 0.5;
    const pp = isLower ? p : 1 - p;
    const t = Math.sqrt(-2 * Math.log(pp));

    const c0 = 2.515517;
    const c1 = 0.802853;
    const c2 = 0.010328;
    const d1 = 1.432788;
    const d2 = 0.189269;
    const d3 = 0.001308;

    const result =
      t -
      (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
    return isLower ? -result : result;
  }
}
