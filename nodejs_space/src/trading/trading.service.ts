import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AlpacaService } from '../alpaca/alpaca.service.js';

@Injectable()
export class TradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alpacaService: AlpacaService,
  ) {}

  async getPositions() {
    const rows = await this.prisma.position_monitoring.findMany({
      orderBy: { last_synced_at: 'desc' },
      take: 300,
    });

    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latest.has(row.symbol)) latest.set(row.symbol, row);
    }

    return [...latest.values()].map((row) => ({
      id: row.id.toString(),
      symbol: row.symbol,
      strategy: row.strategy,
      quantity: Number(row.quantity ?? 0),
      avg_entry_price: Number(row.avg_entry_price ?? 0),
      current_price: Number(row.current_price ?? 0),
      market_value: Number(row.market_value ?? 0),
      unrealized_pl: Number(row.unrealized_pl ?? 0),
      unrealized_pl_pct: Number(row.unrealized_pl_pct ?? 0),
      greeks: {
        delta: Number(row.delta ?? 0),
        gamma: Number(row.gamma ?? 0),
        theta: Number(row.theta ?? 0),
        vega: Number(row.vega ?? 0),
      },
      dte_remaining: row.dte_remaining,
      exit_criteria_status: row.exit_criteria_status,
      updated_at: row.last_synced_at,
    }));
  }

  async getHistory(limit = 150) {
    const orders = await this.prisma.alpaca_order.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
    });

    return orders.map((order) => ({
      id: order.id.toString(),
      symbol: order.symbol,
      side: order.side,
      order_type: order.order_type,
      quantity: Number(order.quantity ?? 0),
      status: order.status,
      filled_avg_price: Number(order.filled_avg_price ?? 0),
      filled_quantity: Number(order.filled_quantity ?? 0),
      submitted_at: order.submitted_at,
      filled_at: order.filled_at,
    }));
  }

  async getPortfolioAnalytics() {
    const positions = await this.getPositions();
    const history = await this.getHistory(500);
    const latestRisk = await this.prisma.risk_metrics.findFirst({
      orderBy: { created_at: 'desc' },
    });

    const totalMarketValue = positions.reduce(
      (sum, p) => sum + p.market_value,
      0,
    );
    const totalUnrealized = positions.reduce(
      (sum, p) => sum + p.unrealized_pl,
      0,
    );

    const closed = history.filter((h) => h.status === 'filled');
    const wins = closed.filter((h) => h.side === 'sell').length;
    const winRate = closed.length > 0 ? wins / closed.length : 0;

    const accountBalance = Number(
      latestRisk?.portfolio_value ?? totalMarketValue,
    );

    return {
      account_balance: accountBalance,
      buying_power: Number((accountBalance * 0.65).toFixed(2)),
      total_pnl: totalUnrealized,
      daily_pnl: totalUnrealized * 0.2,
      weekly_pnl: totalUnrealized * 0.5,
      all_time_pnl: totalUnrealized,
      active_positions: positions.length,
      win_rate: winRate,
      sharpe_ratio: Number((winRate * 2.1).toFixed(4)),
      greeks: {
        delta: positions.reduce((sum, p) => sum + p.greeks.delta, 0),
        gamma: positions.reduce((sum, p) => sum + p.greeks.gamma, 0),
        theta: positions.reduce((sum, p) => sum + p.greeks.theta, 0),
        vega: positions.reduce((sum, p) => sum + p.greeks.vega, 0),
      },
      charts: {
        equity_curve: history.slice(0, 50).map((h, index) => ({
          index,
          value: Number((h.filled_avg_price || 0) * (h.filled_quantity || 0)),
        })),
        drawdown_curve: history.slice(0, 50).map((h, index) => ({
          index,
          value: -Math.abs((h.filled_avg_price || 0) * 0.02),
        })),
      },
    };
  }

  async getRiskMetrics() {
    const latest = await this.prisma.risk_metrics.findFirst({
      orderBy: { created_at: 'desc' },
    });

    return latest
      ? {
          id: latest.id.toString(),
          portfolio_value: Number(latest.portfolio_value ?? 0),
          var_95: Number(latest.var_95 ?? 0),
          max_drawdown_pct: Number(latest.max_drawdown_pct ?? 0),
          portfolio_heat_pct: Number(latest.portfolio_heat_pct ?? 0),
          max_symbol_concentration: Number(
            latest.max_symbol_concentration ?? 0,
          ),
          max_sector_concentration: Number(
            latest.max_sector_concentration ?? 0,
          ),
          portfolio_delta: Number(latest.portfolio_delta ?? 0),
          portfolio_gamma: Number(latest.portfolio_gamma ?? 0),
          portfolio_theta: Number(latest.portfolio_theta ?? 0),
          portfolio_vega: Number(latest.portfolio_vega ?? 0),
          liquidity_score: Number(latest.liquidity_score ?? 0),
          market_regime: latest.market_regime,
          metrics_payload: latest.metrics_payload,
          created_at: latest.created_at,
        }
      : null;
  }

  async manualExit(positionId: bigint) {
    const position = await this.prisma.position_monitoring.findUnique({
      where: { id: positionId },
    });
    if (!position) throw new NotFoundException('Position not found');

    const response = await this.alpacaService.closePosition(position.symbol);
    await this.prisma.exit_signal.create({
      data: {
        position_monitoring_id: position.id,
        trigger_type: 'manual_override',
        trigger_value: Number(position.unrealized_pl_pct ?? 0),
        threshold_value: null,
        rationale: 'Manual override via API',
        executed: true,
        executed_at: new Date(),
      },
    });
    return { ok: true, symbol: position.symbol, response };
  }

  async getExecutionLogs(limit = 200) {
    const logs = await this.prisma.trading_log.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
    });

    return logs.map((log) => ({
      id: log.id.toString(),
      level: log.level,
      event_type: log.event_type,
      symbol: log.symbol,
      message: log.message,
      payload: log.payload,
      created_at: log.created_at,
    }));
  }
}
