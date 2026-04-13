import { gzipSync } from 'zlib';

const axiosGetMock = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: axiosGetMock,
  },
}));

import {
  MarketDataService,
  buildPolygonDayAggregateObjectKey,
  defaultIngestionDate,
} from './market-data.service';

describe('MarketDataService', () => {
  beforeEach(() => {
    axiosGetMock.mockReset();
  });

  it('builds the expected Polygon flat-file object key', () => {
    expect(buildPolygonDayAggregateObjectKey(new Date('2026-04-10T12:30:00.000Z'))).toBe(
      'us_stocks_sip/day_aggs_v1/2026/04/2026-04-10/2026-04-10.csv.gz',
    );
  });

  it('defaults ingestion to the prior weekday', () => {
    expect(defaultIngestionDate(new Date('2026-04-13T10:00:00.000Z')).toISOString()).toBe(
      '2026-04-10T00:00:00.000Z',
    );
  });

  it('filters the flat file to active universe symbols and upserts market bars', async () => {
    const prisma = {
      market_bar: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue(undefined),
      },
      universe: {
        findMany: jest.fn().mockResolvedValue([{ symbol: 'AAPL' }, { symbol: 'MSFT' }]),
      },
      ingestion_run: {
        create: jest.fn().mockResolvedValue({ id: 42 }),
        update: jest.fn().mockResolvedValue(undefined),
        findMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const polygon = {
      getHistoricalBars: jest.fn(),
      getHistoricalBarsRange: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'POLYGON_FLAT_FILES_KEY') return 'flat-key';
        if (key === 'POLYGON_FLAT_FILES_SECRET') return 'flat-secret';
        return undefined;
      }),
    };

    axiosGetMock.mockResolvedValue({
      data: gzipSync(
        [
          'ticker,volume,open,close,high,low,transactions',
          'AAPL,1000,100,110,111,99,10',
          'TSLA,2000,200,205,210,195,20',
          'MSFT,3000,300,305,310,295,30',
        ].join('\n'),
      ),
    });

    const service = new MarketDataService(prisma as never, polygon as never, config as never);

    const result = await service.ingestDayAggregates(new Date('2026-04-10T00:00:00.000Z'));

    expect(result).toMatchObject({
      run_id: 42,
      target_date: '2026-04-10',
      rows_considered: 3,
      rows_ingested: 2,
      rows_skipped: 1,
    });
    expect(prisma.market_bar.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.market_bar.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({
          symbol: 'AAPL',
          volume: BigInt(1000),
          transactions: BigInt(10),
        }),
      }),
    );
    expect(prisma.ingestion_run.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        data: expect.objectContaining({
          status: 'completed',
          rows_considered: 3,
          rows_ingested: 2,
          rows_skipped: 1,
        }),
      }),
    );
  });

  it('prefers locally ingested bars when enough history exists', async () => {
    const localBars = Array.from({ length: 61 }, (_, index) => ({
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100.5 + index,
      volume: BigInt(1000 + index),
      date: new Date(`2026-02-${`${(index % 28) + 1}`.padStart(2, '0')}T00:00:00.000Z`),
    }));
    const prisma = {
      market_bar: {
        findMany: jest.fn().mockResolvedValue(localBars),
      },
      universe: { findMany: jest.fn() },
      ingestion_run: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const polygon = {
      getHistoricalBars: jest.fn(),
      getHistoricalBarsRange: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true),
    };
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const service = new MarketDataService(prisma as never, polygon as never, config as never);
    const bars = await service.getHistoricalBars('AAPL', 80);

    expect(bars).toHaveLength(61);
    expect(polygon.getHistoricalBars).not.toHaveBeenCalled();
    expect(bars[0]).toEqual(
      expect.objectContaining({
        o: expect.any(Number),
        c: expect.any(Number),
      }),
    );
  });

  it('backfills real daily bars from Polygon REST when flat-file access is unavailable', async () => {
    const prisma = {
      market_bar: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue(undefined),
      },
      universe: {
        findMany: jest.fn().mockResolvedValue([{ symbol: 'AAPL' }, { symbol: 'MSFT' }]),
      },
      ingestion_run: {
        create: jest.fn().mockResolvedValue({ id: 7 }),
        update: jest.fn().mockResolvedValue(undefined),
        findMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const polygon = {
      getHistoricalBars: jest.fn(),
      getHistoricalBarsRange: jest
        .fn()
        .mockResolvedValueOnce([
          { o: 100, h: 101, l: 99, c: 100.5, v: 1000, t: new Date('2026-04-01T00:00:00.000Z').getTime() },
          { o: 101, h: 102, l: 100, c: 101.5, v: 1200, t: new Date('2026-04-02T00:00:00.000Z').getTime() },
        ])
        .mockResolvedValueOnce([]),
      isConfigured: jest.fn().mockReturnValue(true),
    };
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const service = new MarketDataService(prisma as never, polygon as never, config as never);
    const result = await service.backfillHistoricalBars(
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-04-05T00:00:00.000Z'),
    );

    expect(result).toMatchObject({
      run_id: 7,
      dataset: 'rest/day_aggs',
      symbols_considered: 2,
      symbols_with_data: 1,
      symbols_without_data: 1,
      rows_ingested: 2,
    });
    expect(prisma.market_bar.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.market_bar.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({
          symbol: 'AAPL',
          source: 'polygon_rest_api',
          volume: BigInt(1000),
        }),
      }),
    );
    expect(prisma.ingestion_run.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({
          status: 'completed',
          rows_considered: 2,
          rows_ingested: 2,
          rows_skipped: 1,
        }),
      }),
    );
  });

  it('summarizes coverage across the active universe', async () => {
    const prisma = {
      market_bar: {
        findMany: jest.fn().mockResolvedValue([
          { symbol: 'AAPL', date: new Date('2026-04-01T00:00:00.000Z'), source: 'polygon_rest_api' },
          { symbol: 'AAPL', date: new Date('2026-04-02T00:00:00.000Z'), source: 'polygon_rest_api' },
          { symbol: 'MSFT', date: new Date('2026-04-02T00:00:00.000Z'), source: 'polygon_flat_file' },
        ]),
      },
      universe: {
        findMany: jest.fn().mockResolvedValue([{ symbol: 'AAPL' }, { symbol: 'MSFT' }, { symbol: 'NVDA' }]),
      },
      ingestion_run: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const polygon = {
      getHistoricalBars: jest.fn(),
      getHistoricalBarsRange: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true),
    };
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const service = new MarketDataService(prisma as never, polygon as never, config as never);
    const coverage = await service.getCoverage({
      from: new Date('2026-04-01T00:00:00.000Z'),
      to: new Date('2026-04-05T00:00:00.000Z'),
    });

    expect(coverage.summary).toMatchObject({
      active_symbols: 3,
      symbols_with_data: 2,
      missing_symbols: 1,
      total_bars: 3,
      source_counts: {
        polygon_rest_api: 2,
        polygon_flat_file: 1,
      },
    });
    expect(coverage.missing_symbols).toEqual(['NVDA']);
  });
});
