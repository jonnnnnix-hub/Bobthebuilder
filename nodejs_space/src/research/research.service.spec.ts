import { ResearchService } from './research.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('ResearchService', () => {
  const prismaMock = {
    signal: {
      findMany: jest.fn(),
    },
    market_bar: {
      findMany: jest.fn(),
    },
  } as unknown as jest.Mocked<PrismaService>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('backtests completed trades using next-trading-day open to horizon close', async () => {
    prismaMock.signal.findMany.mockResolvedValue([
      {
        symbol: 'AAPL',
        date: new Date('2026-04-08T00:00:00.000Z'),
        run_id: 'run_a',
        rank: 1,
        selected: true,
        vrp_20: 0.2,
        iv_z: 1.5,
        selection_reason: 'selected',
      },
    ] as never);
    prismaMock.market_bar.findMany.mockResolvedValue([
      {
        symbol: 'AAPL',
        date: new Date('2026-04-09T00:00:00.000Z'),
        open: 100,
        close: 102,
      },
      {
        symbol: 'AAPL',
        date: new Date('2026-04-10T00:00:00.000Z'),
        open: 103,
        close: 105,
      },
    ] as never);

    const service = new ResearchService(prismaMock);
    const result = await service.backtestSignals({
      selectedOnly: true,
      horizonDays: 2,
      limit: 100,
    });

    expect(result.summary).toMatchObject({
      total_signals: 1,
      completed_trades: 1,
      open_trades: 0,
      missing_entry_bars: 0,
      average_return_pct: 5,
      median_return_pct: 5,
      win_rate_pct: 100,
    });
    expect(result.trades[0]).toMatchObject({
      symbol: 'AAPL',
      status: 'completed',
      entry_date: '2026-04-09',
      exit_date: '2026-04-10',
      entry_open: 100,
      exit_close: 105,
      return_pct: 5,
    });
  });

  it('marks trades as open when there is an entry but not enough forward bars', async () => {
    prismaMock.signal.findMany.mockResolvedValue([
      {
        symbol: 'MSFT',
        date: new Date('2026-04-08T00:00:00.000Z'),
        run_id: 'run_b',
        rank: 1,
        selected: true,
        vrp_20: 0.2,
        iv_z: 1.5,
        selection_reason: 'selected',
      },
    ] as never);
    prismaMock.market_bar.findMany.mockResolvedValue([
      {
        symbol: 'MSFT',
        date: new Date('2026-04-09T00:00:00.000Z'),
        open: 100,
        close: 101,
      },
    ] as never);

    const service = new ResearchService(prismaMock);
    const result = await service.backtestSignals({
      selectedOnly: true,
      horizonDays: 3,
      limit: 100,
    });

    expect(result.summary).toMatchObject({
      completed_trades: 0,
      open_trades: 1,
      missing_entry_bars: 0,
      average_return_pct: null,
      average_mark_to_market_return_pct: 1,
    });
    expect(result.trades[0]).toMatchObject({
      symbol: 'MSFT',
      status: 'open_no_exit',
      entry_date: '2026-04-09',
      exit_date: null,
      mark_to_market_return_pct: 1,
    });
  });

  it('marks trades as missing entry when no later bar exists', async () => {
    prismaMock.signal.findMany.mockResolvedValue([
      {
        symbol: 'SQ',
        date: new Date('2026-04-10T00:00:00.000Z'),
        run_id: 'run_c',
        rank: 1,
        selected: true,
        vrp_20: 0.2,
        iv_z: 1.5,
        selection_reason: 'selected',
      },
    ] as never);
    prismaMock.market_bar.findMany.mockResolvedValue([] as never);

    const service = new ResearchService(prismaMock);
    const result = await service.backtestSignals({
      selectedOnly: true,
      horizonDays: 5,
      limit: 100,
    });

    expect(result.summary).toMatchObject({
      completed_trades: 0,
      open_trades: 0,
      missing_entry_bars: 1,
    });
    expect(result.trades[0]).toMatchObject({
      symbol: 'SQ',
      status: 'missing_entry_bar',
      entry_date: null,
      return_pct: null,
    });
  });
});
