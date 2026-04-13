import { scoreFlowCategory } from './flow-score';
import { scoreIvzCategory } from './ivz-score';
import { scoreMomentumCategory } from './momentum-score';
import { scoreRegimeRiskCategory } from './regime-risk-score';
import { scoreSkewCategory } from './skew-score';
import { scoreTermStructureCategory } from './term-structure-score';
import { scoreVrpCategory } from './vrp-score';
import { ScoreUniverseContext, SymbolScoringInput } from '../interfaces';

const now = new Date('2026-04-10T00:00:00.000Z');

function baseInput(): SymbolScoringInput {
  return {
    symbol: 'AAA',
    currentPrice: 100,
    atmIv: 0.3,
    hv20: 0.2,
    vrp20: 0.1,
    ivZ: 1.7,
    vrpPercentile: 91,
    ivZPercentile: 88,
    asOfDate: now,
    currentOptions: [],
    historicalBars: Array.from({ length: 80 }, (_, idx) => ({
      o: 100 + idx * 0.1,
      h: 101 + idx * 0.1,
      l: 99 + idx * 0.1,
      c: 100 + idx * 0.1,
      v: 1000 + idx * 20,
      t: now.getTime() - (80 - idx) * 86400000,
    })),
    historicalSignals: Array.from({ length: 12 }, (_, idx) => ({
      date: new Date(now.getTime() - (idx + 1) * 86400000),
      atmIv: 0.21 + idx * 0.01,
      vrp20: 0.02 + idx * 0.01,
      ivZ: 0.8 + idx * 0.1,
      compositeScore: 100 + idx,
      normalizedScore: 50 + idx,
    })),
    optionSnapshots: Array.from({ length: 40 }, (_, idx) => ({
      snapshotDate: now,
      snapshotTs: now,
      expiration: new Date(now.getTime() + ((idx % 4) + 20) * 86400000),
      strike: 80 + idx,
      optionType: idx % 2 === 0 ? 'call' : 'put',
      impliedVolatility: 0.25 + (idx % 7) * 0.01,
      delta: idx % 2 === 0 ? 0.2 + (idx % 3) * 0.02 : -0.2 - (idx % 3) * 0.02,
      volume: 50 + idx,
      openInterest: 120 + idx * 2,
      bid: 1 + idx * 0.01,
      ask: 1.1 + idx * 0.01,
    })),
  };
}

const context: ScoreUniverseContext = {
  vrpValues: [0.05, 0.1, 0.2, 0.3],
  ivzValues: [0.5, 1.2, 1.8, 2.2],
};

describe('Scoring category calculators', () => {
  it('scores VRP category', () => {
    expect(scoreVrpCategory(baseInput(), context).score).toBeGreaterThanOrEqual(
      0,
    );
  });

  it('scores IV-Z category', () => {
    expect(scoreIvzCategory(baseInput(), context).score).toBeGreaterThanOrEqual(
      0,
    );
  });

  it('scores term structure category', () => {
    expect(
      scoreTermStructureCategory(baseInput()).score,
    ).toBeGreaterThanOrEqual(0);
  });

  it('scores skew category', () => {
    expect(scoreSkewCategory(baseInput()).score).toBeGreaterThanOrEqual(0);
  });

  it('scores momentum category', () => {
    expect(scoreMomentumCategory(baseInput()).score).toBeGreaterThanOrEqual(0);
  });

  it('scores flow category', () => {
    expect(scoreFlowCategory(baseInput()).score).toBeGreaterThanOrEqual(0);
  });

  it('scores regime & risk category', () => {
    expect(scoreRegimeRiskCategory(baseInput()).score).toBeGreaterThanOrEqual(
      0,
    );
  });
});
