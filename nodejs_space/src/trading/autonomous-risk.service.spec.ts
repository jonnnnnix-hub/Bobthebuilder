import { AutonomousRiskService } from './autonomous-risk.service';
import type { MockedPrisma } from '../test/prisma-mock';
import type { TradingDecision } from './trading.types';

describe('AutonomousRiskService', () => {
  const prismaMock = {
    position_monitoring: {
      findMany: jest.fn(),
    },
    risk_metrics: {
      create: jest.fn(),
    },
  } as unknown as MockedPrisma;

  let service: AutonomousRiskService;

  const decision: TradingDecision = {
    signalId: 1,
    symbol: 'AAPL',
    strategy: {
      strategy: 'short_put',
      score: 80,
      breakdown: { ivz: 2, vrp: 0.2 },
    },
    strikeSelection: {
      expiration: '2026-05-15',
      dte: 30,
      liquidityScore: 0.7,
      rationale: 'test',
    },
    expirationSelection: {
      expiration: '2026-05-15',
      dte: 30,
      thetaEfficiency: 3,
      liquidityScore: 0.7,
      rationale: 'test',
    },
    positionSizing: {
      notionalUsd: 2000,
      contracts: 1,
      heatContributionPct: 1,
      confidenceMultiplier: 1,
      rationale: 'test',
    },
    marketRegime: 'balanced',
    volatilityEnvironment: 'neutral-vol',
    compositeScore: 82,
    scoreConfidence: 0.75,
    rationale: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AutonomousRiskService(prismaMock);
    prismaMock.risk_metrics.create.mockResolvedValue({} as never);
  });

  it('approves when concentration and liquidity are healthy', async () => {
    prismaMock.position_monitoring.findMany.mockResolvedValue([
      {
        symbol: 'MSFT',
        market_value: 12000,
        delta: 15,
        gamma: 1,
        theta: -2,
        vega: 9,
      },
      {
        symbol: 'NVDA',
        market_value: 8000,
        delta: 10,
        gamma: 1,
        theta: -1,
        vega: 6,
      },
    ] as never);

    const result = await service.evaluate(decision);

    expect(result.approved).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(prismaMock.risk_metrics.create).toHaveBeenCalledTimes(1);
  });

  it('blocks when liquidity is too low', async () => {
    prismaMock.position_monitoring.findMany.mockResolvedValue([] as never);

    const result = await service.evaluate({
      ...decision,
      strikeSelection: { ...decision.strikeSelection, liquidityScore: 0.1 },
    });

    expect(result.approved).toBe(false);
    expect(result.reasons.join(' ')).toContain('liquidity score');
  });

  it('blocks when daily loss exceeds the configured limit', async () => {
    prismaMock.position_monitoring.findMany.mockResolvedValue([] as never);

    const result = await service.evaluate(decision, {
      status: 'ACTIVE',
      equity: 95000,
      lastEquity: 100000,
    });

    expect(result.approved).toBe(false);
    expect(result.reasons.join(' ')).toContain('daily loss');
  });

  it('blocks when account status is not ACTIVE', async () => {
    prismaMock.position_monitoring.findMany.mockResolvedValue([] as never);

    const result = await service.evaluate(decision, {
      status: 'ACCOUNT_CLOSED',
      equity: 100000,
      lastEquity: 100000,
    });

    expect(result.approved).toBe(false);
    expect(result.reasons.join(' ')).toContain('ACTIVE');
  });
});
