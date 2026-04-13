import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type BacktestParams = {
  runId?: string;
  symbol?: string;
  selectedOnly: boolean;
  fromDate?: Date;
  toDate?: Date;
  horizonDays: number;
  limit: number;
};

type BacktestTradeStatus = 'completed' | 'open_no_exit' | 'missing_entry_bar';

type SignalRecord = {
  symbol: string;
  date: Date;
  run_id: string;
  rank: number | null;
  selected: boolean;
  vrp_20: number | null;
  iv_z: number | null;
  selection_reason: string | null;
};

type MarketBarRecord = {
  symbol: string;
  date: Date;
  open: number;
  close: number;
};

type BacktestTrade = {
  symbol: string;
  run_id: string;
  signal_date: string;
  selected: boolean;
  rank: number | null;
  selection_reason: string | null;
  status: BacktestTradeStatus;
  horizon_days: number;
  entry_date: string | null;
  entry_open: number | null;
  exit_date: string | null;
  exit_close: number | null;
  return_pct: number | null;
  latest_available_date: string | null;
  latest_available_close: number | null;
  mark_to_market_return_pct: number | null;
  vrp_20: number | null;
  iv_z: number | null;
};

@Injectable()
export class ResearchService {
  constructor(private readonly prisma: PrismaService) {}

  async backtestSignals(params: BacktestParams) {
    const where: Record<string, unknown> = {};
    if (params.runId) {
      where.run_id = params.runId;
    }
    if (params.symbol) {
      where.symbol = params.symbol.toUpperCase();
    }
    if (params.selectedOnly) {
      where.selected = true;
    }
    if (params.fromDate || params.toDate) {
      where.date = {};
      if (params.fromDate) {
        (where.date as Record<string, Date>).gte = normalizeDateOnly(params.fromDate);
      }
      if (params.toDate) {
        (where.date as Record<string, Date>).lte = normalizeDateOnly(params.toDate);
      }
    }

    const signals = await this.prisma.signal.findMany({
      where,
      select: {
        symbol: true,
        date: true,
        run_id: true,
        rank: true,
        selected: true,
        vrp_20: true,
        iv_z: true,
        selection_reason: true,
      },
      orderBy: [{ date: 'asc' }, { rank: 'asc' }, { symbol: 'asc' }],
    }) as SignalRecord[];

    if (signals.length === 0) {
      return {
        parameters: {
          run_id: params.runId ?? null,
          symbol: params.symbol ?? null,
          selected_only: params.selectedOnly,
          from_date: params.fromDate ? formatDateOnly(params.fromDate) : null,
          to_date: params.toDate ? formatDateOnly(params.toDate) : null,
          horizon_days: params.horizonDays,
          trade_limit: params.limit,
        },
        summary: {
          total_signals: 0,
          completed_trades: 0,
          open_trades: 0,
          missing_entry_bars: 0,
          average_return_pct: null,
          median_return_pct: null,
          win_rate_pct: null,
          average_mark_to_market_return_pct: null,
        },
        leaders: {
          best_completed_trade: null,
          worst_completed_trade: null,
        },
        trades: [],
      };
    }

    const symbolSet = [...new Set(signals.map(signal => signal.symbol))];
    const earliestSignalDate = signals.reduce(
      (earliest, signal) => (signal.date.getTime() < earliest.getTime() ? signal.date : earliest),
      signals[0].date,
    );
    const bars = await this.prisma.market_bar.findMany({
      where: {
        symbol: { in: symbolSet },
        date: { gte: normalizeDateOnly(earliestSignalDate) },
      },
      select: {
        symbol: true,
        date: true,
        open: true,
        close: true,
      },
      orderBy: [{ symbol: 'asc' }, { date: 'asc' }],
    }) as MarketBarRecord[];

    const barsBySymbol = new Map<string, MarketBarRecord[]>();
    for (const bar of bars) {
      const rows = barsBySymbol.get(bar.symbol) ?? [];
      rows.push(bar);
      barsBySymbol.set(bar.symbol, rows);
    }
    for (const rows of barsBySymbol.values()) {
      rows.sort((left, right) => left.date.getTime() - right.date.getTime());
    }

    const trades = signals.map(signal => this.evaluateTrade(signal, barsBySymbol.get(signal.symbol) ?? [], params.horizonDays));
    const completedTrades = trades.filter(trade => trade.status === 'completed' && trade.return_pct !== null);
    const openTrades = trades.filter(trade => trade.status === 'open_no_exit');
    const missingEntryTrades = trades.filter(trade => trade.status === 'missing_entry_bar');

    return {
      parameters: {
        run_id: params.runId ?? null,
        symbol: params.symbol ?? null,
        selected_only: params.selectedOnly,
        from_date: params.fromDate ? formatDateOnly(params.fromDate) : null,
        to_date: params.toDate ? formatDateOnly(params.toDate) : null,
        horizon_days: params.horizonDays,
        trade_limit: params.limit,
      },
      summary: {
        total_signals: trades.length,
        completed_trades: completedTrades.length,
        open_trades: openTrades.length,
        missing_entry_bars: missingEntryTrades.length,
        average_return_pct: average(completedTrades.map(trade => trade.return_pct as number)),
        median_return_pct: median(completedTrades.map(trade => trade.return_pct as number)),
        win_rate_pct: completedTrades.length
          ? roundPct((completedTrades.filter(trade => (trade.return_pct as number) > 0).length / completedTrades.length) * 100)
          : null,
        average_mark_to_market_return_pct: average(
          openTrades
            .map(trade => trade.mark_to_market_return_pct)
            .filter((value): value is number => typeof value === 'number'),
        ),
      },
      leaders: {
        best_completed_trade: completedTrades.length
          ? sortDescending(completedTrades, trade => trade.return_pct as number)[0]
          : null,
        worst_completed_trade: completedTrades.length
          ? sortAscending(completedTrades, trade => trade.return_pct as number)[0]
          : null,
      },
      trades: trades.slice(0, params.limit),
    };
  }

  private evaluateTrade(signal: SignalRecord, bars: MarketBarRecord[], horizonDays: number): BacktestTrade {
    const signalTimestamp = normalizeDateOnly(signal.date).getTime();
    const entryIndex = bars.findIndex(bar => normalizeDateOnly(bar.date).getTime() > signalTimestamp);
    const latestBar = bars.length > 0 ? bars[bars.length - 1] : null;

    if (entryIndex === -1) {
      return {
        symbol: signal.symbol,
        run_id: signal.run_id,
        signal_date: formatDateOnly(signal.date),
        selected: signal.selected,
        rank: signal.rank,
        selection_reason: signal.selection_reason,
        status: 'missing_entry_bar',
        horizon_days: horizonDays,
        entry_date: null,
        entry_open: null,
        exit_date: null,
        exit_close: null,
        return_pct: null,
        latest_available_date: latestBar ? formatDateOnly(latestBar.date) : null,
        latest_available_close: latestBar?.close ?? null,
        mark_to_market_return_pct: null,
        vrp_20: signal.vrp_20,
        iv_z: signal.iv_z,
      };
    }

    const entryBar = bars[entryIndex];
    const exitIndex = entryIndex + horizonDays - 1;
    const hasExit = exitIndex < bars.length;
    const exitBar = hasExit ? bars[exitIndex] : null;
    const latestAfterEntry = bars[bars.length - 1];
    const markToMarketReturn = calculateReturnPct(entryBar.open, latestAfterEntry?.close ?? null);

    return {
      symbol: signal.symbol,
      run_id: signal.run_id,
      signal_date: formatDateOnly(signal.date),
      selected: signal.selected,
      rank: signal.rank,
      selection_reason: signal.selection_reason,
      status: hasExit ? 'completed' : 'open_no_exit',
      horizon_days: horizonDays,
      entry_date: formatDateOnly(entryBar.date),
      entry_open: roundValue(entryBar.open),
      exit_date: exitBar ? formatDateOnly(exitBar.date) : null,
      exit_close: exitBar ? roundValue(exitBar.close) : null,
      return_pct: exitBar ? calculateReturnPct(entryBar.open, exitBar.close) : null,
      latest_available_date: latestAfterEntry ? formatDateOnly(latestAfterEntry.date) : null,
      latest_available_close: latestAfterEntry ? roundValue(latestAfterEntry.close) : null,
      mark_to_market_return_pct: hasExit ? null : markToMarketReturn,
      vrp_20: signal.vrp_20,
      iv_z: signal.iv_z,
    };
  }
}

function normalizeDateOnly(value: Date): Date {
  const normalized = new Date(value);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

function formatDateOnly(value: Date): string {
  return normalizeDateOnly(value).toISOString().slice(0, 10);
}

function calculateReturnPct(entryOpen: number | null, exitClose: number | null): number | null {
  if (entryOpen === null || exitClose === null || !Number.isFinite(entryOpen) || !Number.isFinite(exitClose) || entryOpen <= 0) {
    return null;
  }

  return roundPct(((exitClose / entryOpen) - 1) * 100);
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return roundPct(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return roundPct((sorted[midpoint - 1] + sorted[midpoint]) / 2);
  }

  return roundPct(sorted[midpoint]);
}

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundValue(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function sortDescending<T>(rows: T[], selector: (row: T) => number): T[] {
  return [...rows].sort((left, right) => selector(right) - selector(left));
}

function sortAscending<T>(rows: T[], selector: (row: T) => number): T[] {
  return [...rows].sort((left, right) => selector(left) - selector(right));
}
