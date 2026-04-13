import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { HealthController } from '../src/health/health.controller.js';
import { UniverseController } from '../src/universe/universe.controller.js';
import { ConfigController } from '../src/config/config.controller.js';
import { SignalsController } from '../src/signals/signals.controller.js';
import { AnalysisController } from '../src/analysis/analysis.controller.js';
import { BadRequestException, HttpException } from '@nestjs/common';
import { MarketDataController } from '../src/market-data/market-data.controller.js';
import { ResearchController } from '../src/research/research.controller.js';

describe('Bob API (integration)', () => {
  let healthController: HealthController;
  let universeController: UniverseController;
  let configController: ConfigController;
  let signalsController: SignalsController;
  let analysisController: AnalysisController;
  let marketDataController: MarketDataController;
  let researchController: ResearchController;

  const universeRows = [
    { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', active: true },
    {
      symbol: 'MSFT',
      name: 'Microsoft Corporation',
      sector: 'Technology',
      active: true,
    },
    {
      symbol: 'XLF',
      name: 'Financial Select Sector SPDR',
      sector: 'ETF',
      active: true,
    },
  ];

  const configRows = [
    { key: 'top_n_candidates', value: '5', description: 'Top names to select' },
    {
      key: 'vrp_threshold_percentile',
      value: '95',
      description: 'VRP threshold percentile',
    },
    {
      key: 'iv_z_threshold_percentile',
      value: '92.5',
      description: 'IV z-score threshold percentile',
    },
  ];

  const completedRun = {
    run_id: 'run_test_001',
    started_at: new Date('2026-04-12T12:00:00.000Z'),
    symbols_analyzed: 3,
    signals_generated: 1,
    duration_ms: 1234,
    status: 'completed',
  };

  const prismaMock = {
    isConnected: jest.fn().mockReturnValue(true),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    analysis_run: {
      findFirst: jest.fn().mockResolvedValue(completedRun),
      findMany: jest.fn().mockResolvedValue([completedRun]),
      count: jest.fn().mockResolvedValue(1),
    },
    signal: {
      count: jest.fn().mockResolvedValue(1),
      groupBy: jest
        .fn()
        .mockResolvedValue([{ symbol: 'AAPL', _count: { symbol: 1 } }]),
      aggregate: jest.fn().mockResolvedValue({
        _avg: { vrp_20: 1.2, iv_z: 2.3, atm_iv: 0.45 },
      }),
      findMany: jest
        .fn()
        .mockImplementation(
          ({
            where,
            take,
            skip,
          }: {
            where?: Record<string, unknown>;
            take?: number;
            skip?: number;
          }) => {
            if (where?.run_id === completedRun.run_id) {
              return [
                {
                  symbol: 'AAPL',
                  date: new Date('2026-04-12T00:00:00.000Z'),
                  vrp_20: 0.25,
                  rank: 1,
                  selected: true,
                  vrp_percentile: 99,
                  iv_z: 2.5,
                  iv_z_percentile: 98,
                  iv_history_source: 'orats',
                  selection_reason: 'selected',
                  run_id: completedRun.run_id,
                },
                {
                  symbol: 'MSFT',
                  date: new Date('2026-04-12T00:00:00.000Z'),
                  vrp_20: 0.21,
                  rank: 2,
                  selected: false,
                  vrp_percentile: 94,
                  iv_z: 2.9,
                  iv_z_percentile: 96,
                  iv_history_source: 'database_fallback',
                  selection_reason: 'below_vrp_threshold',
                  run_id: completedRun.run_id,
                },
                {
                  symbol: 'NVDA',
                  date: new Date('2026-04-12T00:00:00.000Z'),
                  vrp_20: 0.19,
                  rank: 3,
                  selected: false,
                  vrp_percentile: 93,
                  iv_z: 1.2,
                  iv_z_percentile: 88,
                  iv_history_source: 'missing',
                  selection_reason: 'below_vrp_and_iv_z_threshold',
                  run_id: completedRun.run_id,
                },
              ];
            }

            const allSignals = [
              {
                symbol: 'AAPL',
                date: new Date('2026-04-08T00:00:00.000Z'),
                rank: 1,
                selected: true,
                vrp_20: 0.18,
                iv_z: 1.7,
                vrp_percentile: 97,
                iv_z_percentile: 95,
                iv_history_source: 'orats',
                selection_reason: 'selected',
                run_id: 'run_test_backtest',
              },
              {
                symbol: 'AAPL',
                date: new Date('2026-04-12T00:00:00.000Z'),
                rank: 1,
                selected: true,
                vrp_percentile: 99,
                iv_z_percentile: 98,
                iv_history_source: 'orats',
                selection_reason: 'selected',
                run_id: completedRun.run_id,
              },
              {
                symbol: 'MSFT',
                date: new Date('2026-04-11T00:00:00.000Z'),
                rank: 2,
                selected: false,
                vrp_percentile: 88,
                iv_z_percentile: 71,
                iv_history_source: 'database_fallback',
                selection_reason: 'below_iv_z_threshold',
                run_id: 'run_test_000',
              },
            ];

            const filtered = where?.symbol
              ? allSignals.filter((signal) => signal.symbol === where.symbol)
              : allSignals;
            const filteredBySelection =
              where?.selected === true
                ? filtered.filter((signal) => signal.selected)
                : filtered;
            const dateFilter = where?.date as
              | { gte?: Date; lte?: Date }
              | undefined;
            const filteredByDate = dateFilter
              ? filteredBySelection.filter((signal) => {
                  if (dateFilter.gte && signal.date < dateFilter.gte) {
                    return false;
                  }
                  if (dateFilter.lte && signal.date > dateFilter.lte) {
                    return false;
                  }
                  return true;
                })
              : filteredBySelection;

            return filteredByDate.slice(
              skip ?? 0,
              (skip ?? 0) + (take ?? filteredByDate.length),
            );
          },
        ),
    },
    market_bar: {
      findMany: jest
        .fn()
        .mockImplementation(
          ({ where }: { where?: Record<string, unknown> }) => {
            const bars = [
              {
                symbol: 'AAPL',
                date: new Date('2026-04-10T00:00:00.000Z'),
                open: 100,
                high: 111,
                low: 99,
                close: 110,
                volume: BigInt(1000),
                transactions: BigInt(10),
                source: 'polygon_flat_file',
              },
              {
                symbol: 'AAPL',
                date: new Date('2026-04-09T00:00:00.000Z'),
                open: 98,
                high: 101,
                low: 97,
                close: 100,
                volume: BigInt(900),
                transactions: BigInt(9),
                source: 'polygon_rest_api',
              },
              {
                symbol: 'MSFT',
                date: new Date('2026-04-10T00:00:00.000Z'),
                open: 300,
                high: 305,
                low: 295,
                close: 304,
                volume: BigInt(1200),
                transactions: BigInt(12),
                source: 'polygon_rest_api',
              },
            ];

            const dateFilter = where?.date as
              | { gte?: Date; lte?: Date }
              | undefined;
            return bars.filter((bar) => {
              if (
                typeof where?.symbol === 'string' &&
                bar.symbol !== where.symbol
              ) {
                return false;
              }
              if (dateFilter?.gte && bar.date < dateFilter.gte) {
                return false;
              }
              if (dateFilter?.lte && bar.date > dateFilter.lte) {
                return false;
              }
              return true;
            });
          },
        ),
      upsert: jest.fn(),
    },
    ingestion_run: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          provider: 'polygon',
          dataset: 'us_stocks_sip/day_aggs_v1',
          target_date: new Date('2026-04-10T00:00:00.000Z'),
          status: 'completed',
          rows_considered: 5000,
          rows_ingested: 3,
          rows_skipped: 4997,
          duration_ms: 1500,
          started_at: new Date('2026-04-11T12:00:00.000Z'),
          completed_at: new Date('2026-04-11T12:00:01.500Z'),
        },
      ]),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue(undefined),
    },
    universe: {
      findMany: jest
        .fn()
        .mockImplementation(
          ({ where }: { where?: Record<string, unknown> }) => {
            return universeRows.filter((row) => {
              if (where?.active === true && !row.active) {
                return false;
              }
              if (
                typeof where?.sector === 'string' &&
                row.sector !== where.sector
              ) {
                return false;
              }
              return true;
            });
          },
        ),
      groupBy: jest.fn().mockResolvedValue([
        { sector: 'Technology', _count: { symbol: 2 } },
        { sector: 'ETF', _count: { symbol: 1 } },
      ]),
    },
    configuration: {
      findMany: jest.fn().mockResolvedValue(configRows),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    healthController = moduleFixture.get(HealthController);
    universeController = moduleFixture.get(UniverseController);
    configController = moduleFixture.get(ConfigController);
    signalsController = moduleFixture.get(SignalsController);
    analysisController = moduleFixture.get(AnalysisController);
    marketDataController = moduleFixture.get(MarketDataController);
    researchController = moduleFixture.get(ResearchController);
  }, 30000);

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const result = await healthController.healthCheck();

      expect(result.status).toBe('ok');
      expect(result.service).toBe('bob-volatility-signal-generator');
      expect(result.database).toBe('connected');
    });
  });

  describe('GET /api/universe', () => {
    it('should return symbol universe', async () => {
      const result = await universeController.getUniverse();

      expect(result.total).toBeGreaterThan(0);
      expect(result.sectors).toBeDefined();
      expect(result.symbols).toBeDefined();
      expect(Array.isArray(result.symbols)).toBe(true);
    });

    it('should filter by sector', async () => {
      const result = await universeController.getUniverse(
        undefined,
        'Technology',
      );

      expect(
        result.symbols.every(
          (row: { sector: string }) => row.sector === 'Technology',
        ),
      ).toBe(true);
    });

    it('should reject invalid active_only values', async () => {
      await expect(
        universeController.getUniverse('yes'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('GET /api/config', () => {
    it('should return configuration', async () => {
      const result = await configController.getConfig();

      expect(result.top_n_candidates.value).toBe('5');
      expect(result.vrp_threshold_percentile.value).toBe('95');
      expect(result.iv_z_threshold_percentile.value).toBe('92.5');
    });
  });

  describe('GET /api/signals/latest', () => {
    it('should return latest signals', async () => {
      const result = await signalsController.getLatest();

      expect(result).toBeDefined();
      expect(result.signals).toBeDefined();
      expect(result.signals[0]).toMatchObject({
        selection_reason: 'selected',
        vrp_percentile: 99,
        iv_z_percentile: 98,
      });
    });
  });

  describe('GET /api/signals/history', () => {
    it('should return paginated signal history', async () => {
      const result = await signalsController.getHistory(
        undefined,
        undefined,
        undefined,
        undefined,
        '1',
        '10',
      );

      expect(result.signals).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });

    it('should reject invalid pagination input', async () => {
      await expect(
        signalsController.getHistory(
          undefined,
          undefined,
          undefined,
          undefined,
          'abc',
          '10',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('GET /api/analysis/runs', () => {
    it('should return analysis run history', async () => {
      const result = await analysisController.getRuns();

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('GET /api/analysis/stats', () => {
    it('should return analysis statistics', async () => {
      const result = await analysisController.getStats();

      expect(result.total_completed_runs).toBeDefined();
      expect(result.total_signals_generated).toBeDefined();
      expect(result.average_signal_metrics).toBeDefined();
    });

    it('should return run diagnostics for the latest completed run', async () => {
      const result = await analysisController.getDiagnostics();

      expect(result.thresholds).toMatchObject({
        top_n: 5,
        vrp_percentile: 95,
        iv_z_percentile: 92.5,
      });
      expect(result.summary.reason_counts).toMatchObject({
        selected: 1,
        below_vrp_threshold: 1,
        below_vrp_and_iv_z_threshold: 1,
      });
      expect(result.summary.iv_history_source_counts).toMatchObject({
        orats: 1,
        database_fallback: 1,
        missing: 1,
      });
      expect(result.nearest_misses[0]).toMatchObject({
        symbol: 'MSFT',
        selection_reason: 'below_vrp_threshold',
      });
    });
  });

  describe('GET /api/market/bars', () => {
    it('should return stored market bars', async () => {
      const result = await marketDataController.getBars('aapl');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        symbol: 'AAPL',
        volume: '1000',
        transactions: '10',
        source: 'polygon_flat_file',
      });
      expect(result[1]).toMatchObject({
        symbol: 'AAPL',
        volume: '900',
        transactions: '9',
        source: 'polygon_rest_api',
      });
    });

    it('should reject reversed date ranges', async () => {
      await expect(
        marketDataController.getBars('AAPL', '2026-04-11', '2026-04-10'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('GET /api/market/ingestion/runs', () => {
    it('should return ingestion runs', async () => {
      const result = await marketDataController.getIngestionRuns();

      expect(result[0]).toMatchObject({
        provider: 'polygon',
        dataset: 'us_stocks_sip/day_aggs_v1',
        rows_ingested: 3,
      });
    });
  });

  describe('GET /api/market/coverage', () => {
    it('should summarize local coverage for a date range', async () => {
      const result = await marketDataController.getCoverage(
        '2026-04-09',
        '2026-04-10',
      );

      expect(result.summary).toMatchObject({
        active_symbols: 3,
        symbols_with_data: 2,
        missing_symbols: 1,
        total_bars: 3,
      });
      expect(result.summary.source_counts).toMatchObject({
        polygon_flat_file: 1,
        polygon_rest_api: 2,
      });
      expect(result.missing_symbols).toEqual(['XLF']);
    });
  });

  describe('GET /api/research/backtest', () => {
    it('should backtest persisted selected signals against stored bars', async () => {
      const result = await researchController.backtestSignals(
        undefined,
        undefined,
        undefined,
        '2026-04-01',
        '2026-04-10',
        '2',
      );

      expect(result.summary).toMatchObject({
        total_signals: 1,
        completed_trades: 1,
        open_trades: 0,
        missing_entry_bars: 0,
      });
      expect(result.trades[0]).toMatchObject({
        symbol: 'AAPL',
        status: 'completed',
        entry_date: '2026-04-09',
        exit_date: '2026-04-10',
      });
    });

    it('should reject reversed signal date ranges', async () => {
      await expect(
        researchController.backtestSignals(
          undefined,
          undefined,
          undefined,
          '2026-04-10',
          '2026-04-01',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('POST /api/analysis/trigger', () => {
    it('should reject cron trigger without API key', async () => {
      await expect(
        analysisController.triggerAnalysis(undefined, 'cron'),
      ).rejects.toBeInstanceOf(HttpException);
      await expect(
        analysisController.triggerAnalysis(undefined, 'cron'),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('should reject unsupported trigger sources', async () => {
      await expect(
        analysisController.triggerAnalysis(undefined, 'timer'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
