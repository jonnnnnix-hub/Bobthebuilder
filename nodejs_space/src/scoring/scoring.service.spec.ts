import { ScoringService } from './scoring.service';
import { SymbolScoringInput } from './interfaces';

function buildInput(
  overrides: Partial<SymbolScoringInput> = {},
): SymbolScoringInput {
  const now = new Date('2026-04-10T00:00:00.000Z');
  return {
    symbol: 'AAA',
    currentPrice: 100,
    atmIv: 0.35,
    hv20: 0.2,
    vrp20: 0.15,
    ivZ: 1.8,
    vrpPercentile: 92,
    ivZPercentile: 89,
    asOfDate: now,
    historicalBars: Array.from({ length: 80 }, (_, idx) => ({
      o: 95 + idx * 0.2,
      h: 96 + idx * 0.2,
      l: 94 + idx * 0.2,
      c: 95 + idx * 0.2,
      v: 100000 + idx * 250,
      t: now.getTime() - (80 - idx) * 86400000,
    })),
    currentOptions: [],
    historicalSignals: Array.from({ length: 12 }, (_, idx) => ({
      date: new Date(now.getTime() - (idx + 1) * 86400000),
      atmIv: 0.22 + idx * 0.01,
      vrp20: 0.05 + idx * 0.01,
      ivZ: 0.8 + idx * 0.08,
      compositeScore: 100 + idx,
      normalizedScore: 55 + idx,
    })),
    optionSnapshots: Array.from({ length: 30 }, (_, idx) => ({
      snapshotDate: new Date('2026-04-10T00:00:00.000Z'),
      snapshotTs: new Date('2026-04-10T20:00:00.000Z'),
      expiration: new Date(`2026-0${(idx % 3) + 5}-20T00:00:00.000Z`),
      strike: 85 + idx,
      optionType: idx % 2 === 0 ? 'call' : 'put',
      impliedVolatility: 0.25 + (idx % 10) * 0.01,
      delta: idx % 2 === 0 ? 0.2 + (idx % 5) * 0.03 : -0.2 - (idx % 5) * 0.03,
      volume: 100 + idx * 5,
      openInterest: 400 + idx * 20,
      bid: 1 + idx * 0.02,
      ask: 1.15 + idx * 0.02,
    })),
    ...overrides,
  };
}

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(() => {
    service = new ScoringService();
  });

  it('computes 7-category composite scores and normalizes to 0-100', () => {
    const result = service.scoreUniverse([
      buildInput(),
      buildInput({ symbol: 'BBB', vrp20: 0.22, ivZ: 2.1 }),
    ]);

    expect(result).toHaveLength(2);
    for (const score of result) {
      expect(score.totalScore).toBeGreaterThan(0);
      expect(score.normalizedScore).toBeGreaterThanOrEqual(0);
      expect(score.normalizedScore).toBeLessThanOrEqual(100);
      expect(score.categories.vrp.maxPoints).toBe(30);
      expect(score.categories.regime_risk.maxPoints).toBe(35);
    }
  });

  it('ranks and selects by composite threshold + topN', () => {
    const scored = service.scoreUniverse([
      buildInput({ symbol: 'AAA', vrp20: 0.3, ivZ: 2.5 }),
      buildInput({ symbol: 'BBB', vrp20: 0.2, ivZ: 2.0 }),
      buildInput({ symbol: 'CCC', vrp20: 0.1, ivZ: 1.0 }),
    ]);

    const ranked = service.rankAndSelect(scored, {
      topN: 1,
      compositeThresholdPct: 40,
    });
    expect(ranked[0].selected).toBe(true);
    expect(ranked.filter((item) => item.selected)).toHaveLength(1);
    expect(ranked[0].selectionReason).toBe('selected');
  });

  it('handles missing core inputs without crashing and marks missing reason', () => {
    const scored = service.scoreUniverse([
      buildInput({
        symbol: 'AAA',
        vrp20: null,
        ivZ: null,
        vrpPercentile: null,
        ivZPercentile: null,
      }),
    ]);
    const ranked = service.rankAndSelect(scored, {
      topN: 5,
      compositeThresholdPct: 70,
    });

    expect(ranked[0].selectionReason).toBe('missing_vrp_20_and_iv_z');
    expect(ranked[0].normalizedScore).toBeGreaterThanOrEqual(0);
  });
});
