import { AnalysisService } from './analysis.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PolygonService } from '../polygon/polygon.service';
import type { CalculationService, FeatureSet } from '../calculation/calculation.service';
import type { OratsService } from '../orats/orats.service';
import type { MarketDataService } from '../market-data/market-data.service';

describe('AnalysisService', () => {
  let service: AnalysisService;

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
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as unknown as jest.Mocked<PrismaService>;

  const polygonMock = {
    isConfigured: jest.fn(),
    getPreviousClose: jest.fn(),
    getOptionsSnapshot: jest.fn(),
    getHistoricalBars: jest.fn(),
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
    rankAndSelect: jest.fn(),
  } as unknown as jest.Mocked<CalculationService>;

  beforeEach(() => {
    jest.clearAllMocks();

    prismaMock.configuration.findMany.mockResolvedValue([
      { key: 'top_n_candidates', value: '5' },
      { key: 'vrp_threshold_percentile', value: '95' },
      { key: 'iv_z_threshold_percentile', value: '92.5' },
    ] as never);
    prismaMock.universe.findMany.mockResolvedValue([
      { symbol: 'AAA' },
      { symbol: 'BBB' },
      { symbol: 'CCC' },
    ] as never);
    prismaMock.$transaction.mockImplementation(async (operations: unknown[]) => Promise.all(operations));
    prismaMock.signal.upsert.mockImplementation(async (payload: unknown) => payload as never);
    prismaMock.signal.findMany.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => ({ atm_iv: 0.2 + index * 0.005 })) as never,
    );

    polygonMock.isConfigured.mockReturnValue(true);
    oratsMock.isConfigured.mockReturnValue(true);
    oratsMock.getCurrentIv30d.mockResolvedValue(0.31);
    oratsMock.getHistoricalIv30dSeries.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => 0.25 + index * 0.002),
    );
    calculationMock.extractAtmIv.mockReturnValue(0.4);

    service = new AnalysisService(prismaMock, polygonMock, oratsMock, calculationMock, marketDataMock);
  });

  it('stores processed symbols even when only some are rankable', async () => {
    const rankedFeature = {
      symbol: 'AAA',
      atm_iv: 0.4,
      hv_10: 0.2,
      hv_20: 0.2,
      hv_60: 0.2,
      vrp_20: 0.2,
      iv_z: 3,
      rank: 1,
      selected: true,
      vrp_percentile: 99,
      iv_z_percentile: 99,
      iv_history_source: 'orats',
      selection_reason: 'selected',
    };

    polygonMock.getPreviousClose.mockImplementation(async (symbol: string) => (symbol === 'CCC' ? 100 : 100));
    polygonMock.getOptionsSnapshot.mockImplementation(async (symbol: string) => {
      if (symbol === 'CCC') {
        throw new Error('429 Too Many Requests');
      }

      return [];
    });
    marketDataMock.getHistoricalBars.mockImplementation(async (symbol: string) =>
      symbol === 'BBB'
        ? [{ c: 100, h: 101, l: 99, o: 100, v: 1000, t: 1 }]
        : [{ c: 100, h: 101, l: 99, o: 100, v: 1000, t: 1 }],
    );
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
        atm_iv: null,
        hv_10: 0.2,
        hv_20: 0.2,
        hv_60: 0.2,
        vrp_20: null,
        iv_z: null,
      } as FeatureSet);
    calculationMock.rankAndSelect.mockReturnValue({
      ranked: [rankedFeature],
    } as never);

    const result = await service.runAnalysis();

    expect(result.symbols_analyzed).toBe(2);
    expect(result.signals_generated).toBe(1);
    expect(result.selected).toEqual(['AAA']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('CCC');
    expect(prismaMock.signal.upsert).toHaveBeenCalledTimes(2);

    const firstUpsert = prismaMock.signal.upsert.mock.calls[0][0] as {
      create: { symbol: string; rank: number | null; selected: boolean; selection_reason: string; vrp_percentile: number | null; iv_z_percentile: number | null; iv_history_source: string | null };
    };
    const secondUpsert = prismaMock.signal.upsert.mock.calls[1][0] as {
      create: { symbol: string; rank: number | null; selected: boolean; selection_reason: string; vrp_percentile: number | null; iv_z_percentile: number | null; iv_history_source: string | null };
    };

    expect(firstUpsert.create).toMatchObject({
      symbol: 'AAA',
      rank: 1,
      selected: true,
      selection_reason: 'selected',
      vrp_percentile: 99,
      iv_z_percentile: 99,
      iv_history_source: 'orats',
    });
    expect(secondUpsert.create).toMatchObject({
      symbol: 'BBB',
      rank: null,
      selected: false,
      selection_reason: 'missing_vrp_20_and_iv_z',
      vrp_percentile: null,
      iv_z_percentile: null,
      iv_history_source: 'orats',
    });

    const updatePayload = prismaMock.analysis_run.update.mock.calls[0][0] as {
      data: { status: string; errors: string | null };
    };
    expect(updatePayload.data.status).toBe('completed');
    expect(updatePayload.data.errors).toContain('"failure_count":1');
    expect(updatePayload.data.errors).toContain('"skipped_count":0');
    expect(calculationMock.computeFeatures).toHaveBeenNthCalledWith(
      1,
      'AAA',
      [],
      100,
      [{ c: 100, h: 101, l: 99, o: 100, v: 1000, t: 1 }],
      expect.any(Array),
      0.31,
    );
    const historicalIvs = (calculationMock.computeFeatures.mock.calls[0] as unknown[])[4] as number[];
    expect(historicalIvs[0]).toBeCloseTo(0.25);
    expect(historicalIvs[1]).toBeCloseTo(0.252);
  });

  it('fails the run when no symbols produce features', async () => {
    polygonMock.getPreviousClose.mockResolvedValue(null as never);
    calculationMock.rankAndSelect.mockReturnValue({ ranked: [] } as never);

    await expect(service.runAnalysis()).rejects.toThrow('Analysis produced no features for any active symbols');

    const updatePayload = prismaMock.analysis_run.update.mock.calls[0][0] as {
      data: { status: string; errors: string | null };
    };
    expect(updatePayload.data.status).toBe('failed');
    expect(updatePayload.data.errors).toContain('"skipped_count":3');
  });

  it('fails fast when the Polygon API key is missing', async () => {
    polygonMock.isConfigured.mockReturnValue(false);

    await expect(service.runAnalysis()).rejects.toThrow('POLYGON_API_KEY is not configured');
    expect(prismaMock.universe.findMany).not.toHaveBeenCalled();
    expect(prismaMock.analysis_run.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
        }),
      }),
    );
  });

  it('falls back to stored real ATM IV history when ORATS is unavailable', async () => {
    oratsMock.getCurrentIv30d.mockRejectedValue(new Error('ORATS unavailable'));
    oratsMock.getHistoricalIv30dSeries.mockRejectedValue(new Error('ORATS unavailable'));
    polygonMock.getPreviousClose.mockResolvedValue(100 as never);
    polygonMock.getOptionsSnapshot.mockResolvedValue([] as never);
    marketDataMock.getHistoricalBars.mockResolvedValue([{ c: 100, h: 101, l: 99, o: 100, v: 1000, t: 1 }] as never);
    calculationMock.computeFeatures.mockReturnValue({
      symbol: 'AAA',
      atm_iv: 0.4,
      hv_10: 0.2,
      hv_20: 0.2,
      hv_60: 0.2,
      vrp_20: 0.2,
      iv_z: 1.2,
    } as FeatureSet);
    calculationMock.rankAndSelect.mockReturnValue({
      ranked: [
        {
          symbol: 'AAA',
          atm_iv: 0.4,
          hv_10: 0.2,
          hv_20: 0.2,
          hv_60: 0.2,
          vrp_20: 0.2,
          iv_z: 1.2,
          rank: 1,
          selected: true,
          vrp_percentile: 99,
          iv_z_percentile: 99,
          iv_history_source: 'database_fallback',
          selection_reason: 'selected',
        },
      ],
    } as never);
    prismaMock.universe.findMany.mockResolvedValue([{ symbol: 'AAA' }] as never);

    await service.runAnalysis();

    const historicalIvs = (calculationMock.computeFeatures.mock.calls[0] as unknown[])[4] as number[];
    expect(historicalIvs[0]).toBeCloseTo(0.2);
    expect((calculationMock.computeFeatures.mock.calls[0] as unknown[])[5]).toBe(0.4);
    expect(oratsMock.getHistoricalIv30dSeries).toHaveBeenCalled();
    const upsertPayload = prismaMock.signal.upsert.mock.calls[0][0] as {
      create: { iv_history_source: string };
    };
    expect(upsertPayload.create.iv_history_source).toBe('database_fallback');
  });
});
