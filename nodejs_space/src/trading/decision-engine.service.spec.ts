import { DecisionEngineService } from './decision-engine.service';
import type { MockedPrisma } from '../test/prisma-mock';
import type { AlpacaService } from '../alpaca/alpaca.service';

describe('DecisionEngineService', () => {
  const prismaMock = {
    signal: { findUnique: jest.fn() },
    option_chain_snapshot: { findMany: jest.fn() },
  } as unknown as MockedPrisma;

  const alpacaMock = {
    getAccount: jest.fn(),
  } as unknown as jest.Mocked<AlpacaService>;

  let service: DecisionEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DecisionEngineService(prismaMock, alpacaMock);
    alpacaMock.getAccount.mockResolvedValue({ equity: 100000 } as never);
  });

  it('builds a model-driven decision for selected signal', async () => {
    prismaMock.signal.findUnique.mockResolvedValue({
      id: 11,
      symbol: 'NVDA',
      selected: true,
      iv_z: 2.1,
      vrp_20: 0.18,
      category_scores: {
        skew: { score: 18 },
        term: { score: 22 },
      },
      score_confidence: 0.8,
      composite_score_normalized: 84,
      hv_20: 0.35,
      hv_60: 0.24,
    } as never);

    prismaMock.option_chain_snapshot.findMany.mockResolvedValue([
      {
        expiration: new Date(Date.now() + 25 * 86400000),
        strike: 900,
        option_type: 'call',
        delta: 0.36,
        bid: 10,
        ask: 10.5,
        open_interest: 12000,
        volume: 3500,
      },
      {
        expiration: new Date(Date.now() + 25 * 86400000),
        strike: 850,
        option_type: 'put',
        delta: -0.34,
        bid: 9,
        ask: 9.6,
        open_interest: 15000,
        volume: 4000,
      },
    ] as never);

    const result = await service.buildDecision(11);

    expect(result).not.toBeNull();
    expect(result?.symbol).toBe('NVDA');
    expect(result?.strategy.strategy).toBeDefined();
    expect(result?.positionSizing.notionalUsd).toBeGreaterThan(0);
    expect(result?.expirationSelection.dte).toBeGreaterThan(0);
  });

  it('returns null for non-selected signals', async () => {
    prismaMock.signal.findUnique.mockResolvedValue({
      id: 12,
      symbol: 'AAPL',
      selected: false,
    } as never);

    const result = await service.buildDecision(12);
    expect(result).toBeNull();
  });
});
