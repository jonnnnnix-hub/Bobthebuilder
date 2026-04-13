import { AnalysisService } from './analysis.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PolygonService } from '../polygon/polygon.service';
import type {
  CalculationService,
  FeatureSet,
} from '../calculation/calculation.service';
import type { OratsService } from '../orats/orats.service';
import type { MarketDataService } from '../market-data/market-data.service';
import type { ScoringService } from '../scoring/scoring.service';

describe('AnalysisService', () => {
  let service: AnalysisService;

  const txMock = {
    signal: {
      upsert: jest.fn(),
    },
    score_breakdown: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    score_history: {
      upsert: jest.fn(),
    },
  };

  const prismaMock = {
    analysis_run: {
      create: jest.fn(),
      update: jest.fn(),
    },
    universe: {
      findMany: jest.fn(),
    },
    configuration: {
      findMany: jest.fn(),
    },
    signal: {
      findMany: jest.fn(),
    },
    option_chain_snapshot: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as unknown as jest.Mocked<PrismaService>;

  const polygonMock = {
    isConfigured: jest.fn(),
    getPreviousClose: jest.fn(),
    getOptionsSnapshot: jest.fn(),
  } as unknown as jest.Mocked<PolygonService>;

  const oratsMock = {
    isConfigured: jest.fn(),
    getCurrentIv30d: jest.fn(),
    getHistoricalIv30dSeries: jest.fn(),
  } as unknown as jest.Mocked<OratsService>;

  const marketDataMock = {
    getHistoricalBars: jest.fn(),
  } as unknown as jest.Mocked<MarketDataService>;

  const calculationMock = {
    extractAtmIv: jest.fn(),
    computeFeatures: jest.fn(),
  } as unknown as jest.Mocked<CalculationService>;

  const scoringMock = {
    scoreUniverse: jest.fn(),
    rankAndSelect: jest.fn(),
  } as unknown as jest.Mocked<ScoringService>;

  beforeEach(() => {
    jest.clearAllMocks();

    prismaMock.configuration.findMany.mockResolvedValue([
      { key: 'top_n_candidates', value: '5' },
      { key: 'composite_score_threshold_percentile', value: '70' },
    ] as never);
    prismaMock.universe.findMany.mockResolvedValue([
      { symbol: 'AAA' },
      { symbol: 'BBB' },
    ] as never);
    prismaMock.signal.findMany.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => ({
        date: new Date(Date.now() - (index + 1) * 86400000),
        atm_iv: 0.2 + index * 0.005,
        vrp_20: 0.1 + index * 0.002,
        iv_z: 1 + index * 0.05,
        composite_score: 120 + index,
        composite_score_normalized: 60 + index * 0.1,
      })) as never,
    );
    prismaMock.option_chain_snapshot.findMany.mockResolvedValue([] as never);
    prismaMock.$transaction.mockImplementation(async (arg: any) => {
      if (typeof arg === 'function') {
        return arg(txMock);
      }
      return Promise.all(arg);
    });

    txMock.signal.upsert.mockResolvedValue({ id: 1 } as never);
    txMock.score_breakdown.deleteMany.mockResolvedValue({ count: 0 } as never);
    txMock.score_breakdown.createMany.mockResolvedValue({ count: 1 } as never);
    txMock.score_history.upsert.mockResolvedValue({ id: 1 } as never);

    polygonMock.isConfigured.mockReturnValue(true);
    polygonMock.getPreviousClose.mockResolvedValue(100 as never);
    polygonMock.getOptionsSnapshot.mockResolvedValue([] as never);

    oratsMock.isConfigured.mockReturnValue(true);
    oratsMock.getCurrentIv30d.mockResolvedValue(0.31);
    oratsMock.getHistoricalIv30dSeries.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => 0.25 + index * 0.002),
    );

    marketDataMock.getHistoricalBars.mockResolvedValue([
      { c: 100, h: 101, l: 99, o: 100, v: 1000, t: 1 },
      { c: 101, h: 102, l: 100, o: 101, v: 1100, t: 2 },
    ] as never);

    calculationMock.extractAtmIv.mockReturnValue(0.4);
    calculationMock.computeFeatures
      .mockReturnValueOnce({
        symbol: 'AAA',
        atm_iv: 0.4,
        hv_10: 0.2,
        hv_20: 0.2,
        hv_60: 0.2,
        vrp_20: 0.2,
        iv_z: 3,
      } as FeatureSet)
      .mockReturnValueOnce({
        symbol: 'BBB',
        atm_iv: 0.35,
        hv_10: 0.2,
        hv_20: 0.22,
        hv_60: 0.24,
        vrp_20: 0.13,
        iv_z: 2,
      } as FeatureSet);

    const scoredResults = [
      {
        symbol: 'AAA',
        totalScore: 150,
        totalMaxPoints: 200,
        normalizedScore: 75,
        confidence: { coverage: 1, score: 0.8, low: 68, high: 82 },
        categories: {
          vrp: {
            category: 'vrp',
            score: 22,
            maxPoints: 30,
            availableMaxPoints: 30,
            components: [
              {
                name: 'vrp_percentile',
                rawValue: 95,
                scaledScore: 8,
                maxPoints: 10,
                dataSource: 'x',
              },
            ],
          },
          ivz: {
            category: 'ivz',
            score: 20,
            maxPoints: 30,
            availableMaxPoints: 30,
            components: [
              {
                name: 'iv_universe_percentile',
                rawValue: 90,
                scaledScore: 6,
                maxPoints: 8,
                dataSource: 'x',
              },
            ],
          },
          term: {
            category: 'term',
            score: 18,
            maxPoints: 30,
            availableMaxPoints: 30,
            components: [],
          },
          skew: {
            category: 'skew',
            score: 17,
            maxPoints: 25,
            availableMaxPoints: 25,
            components: [],
          },
          momentum: {
            category: 'momentum',
            score: 21,
            maxPoints: 25,
            availableMaxPoints: 25,
            components: [],
          },
          flow: {
            category: 'flow',
            score: 23,
            maxPoints: 25,
            availableMaxPoints: 25,
            components: [],
          },
          regime_risk: {
            category: 'regime_risk',
            score: 29,
            maxPoints: 35,
            availableMaxPoints: 35,
            components: [],
          },
        },
      },
      {
        symbol: 'BBB',
        totalScore: 110,
        totalMaxPoints: 200,
        normalizedScore: 55,
        confidence: { coverage: 1, score: 0.6, low: 48, high: 62 },
        categories: {
          vrp: {
            category: 'vrp',
            score: 15,
            maxPoints: 30,
            availableMaxPoints: 30,
            components: [
              {
                name: 'vrp_percentile',
                rawValue: 70,
                scaledScore: 0,
                maxPoints: 10,
                dataSource: 'x',
              },
            ],
          },
          ivz: {
            category: 'ivz',
            score: 14,
            maxPoints: 30,
            availableMaxPoints: 30,
            components: [
              {
                name: 'iv_universe_percentile',
                rawValue: 60,
                scaledScore: 0,
                maxPoints: 8,
                dataSource: 'x',
              },
            ],
          },
          term: {
            category: 'term',
            score: 16,
            maxPoints: 30,
            availableMaxPoints: 30,
            components: [],
          },
          skew: {
            category: 'skew',
            score: 14,
            maxPoints: 25,
            availableMaxPoints: 25,
            components: [],
          },
          momentum: {
            category: 'momentum',
            score: 14,
            maxPoints: 25,
            availableMaxPoints: 25,
            components: [],
          },
          flow: {
            category: 'flow',
            score: 16,
            maxPoints: 25,
            availableMaxPoints: 25,
            components: [],
          },
          regime_risk: {
            category: 'regime_risk',
            score: 21,
            maxPoints: 35,
            availableMaxPoints: 35,
            components: [],
          },
        },
      },
    ];
    scoringMock.scoreUniverse.mockReturnValue(scoredResults as never);

    scoringMock.rankAndSelect.mockReturnValue([
      {
        ...scoredResults[0],
        rank: 1,
        selected: true,
        selectionReason: 'selected',
      },
      {
        ...scoredResults[1],
        rank: 2,
        selected: false,
        selectionReason: 'below_composite_threshold',
      },
    ] as never);

    service = new AnalysisService(
      prismaMock,
      polygonMock,
      oratsMock,
      calculationMock,
      marketDataMock,
      scoringMock,
    );
  });

  it('stores composite scores and score history/breakdown', async () => {
    const result = await service.runAnalysis();

    expect(result.symbols_analyzed).toBe(2);
    expect(result.signals_generated).toBe(1);
    expect(result.selected).toEqual(['AAA']);
    expect(scoringMock.scoreUniverse).toHaveBeenCalledTimes(1);
    expect(scoringMock.rankAndSelect).toHaveBeenCalledWith(expect.any(Array), {
      topN: 5,
      compositeThresholdPct: 70,
    });

    expect(txMock.signal.upsert).toHaveBeenCalledTimes(2);
    expect(txMock.score_history.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.analysis_run.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
        }),
      }),
    );
  });

  it('fails fast when polygon key is missing', async () => {
    polygonMock.isConfigured.mockReturnValue(false);

    await expect(service.runAnalysis()).rejects.toThrow(
      'POLYGON_API_KEY is not configured',
    );
    expect(prismaMock.universe.findMany).not.toHaveBeenCalled();
    expect(prismaMock.analysis_run.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });

  it('falls back to stored iv history when ORATS is unavailable', async () => {
    oratsMock.getCurrentIv30d.mockRejectedValue(new Error('ORATS unavailable'));
    oratsMock.getHistoricalIv30dSeries.mockRejectedValue(
      new Error('ORATS unavailable'),
    );

    await service.runAnalysis();

    expect(oratsMock.getHistoricalIv30dSeries).toHaveBeenCalled();
    const computeCall = calculationMock.computeFeatures.mock
      .calls[0] as unknown[];
    const historicalIvs = computeCall[4] as number[];
    expect(historicalIvs.length).toBeGreaterThan(0);
    expect(computeCall[5]).toBe(0.4);
  });
});
