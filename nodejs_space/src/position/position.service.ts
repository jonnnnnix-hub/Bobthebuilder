import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PolygonService } from '../polygon/polygon.service.js';

export interface PortfolioSummary {
  total_pnl: number;
  net_delta: number;
  total_theta: number;
  positions_count: number;
  positions: Array<{
    trade_id: number;
    symbol: string;
    strategy: string;
    entry_credit: number | null;
    latest_mark: number | null;
    pnl_unrealized: number | null;
    delta: number | null;
    theta: number | null;
    days_to_expiry: number | null;
  }>;
}

@Injectable()
export class PositionService {
  private readonly logger = new Logger(PositionService.name);

  constructor(
    private prisma: PrismaService,
    private polygonService: PolygonService,
  ) {}

  async snapshotAllOpenPositions(): Promise<{ snapshots_created: number; errors: string[] }> {
    const openTrades = await this.prisma.trade.findMany({
      where: { status: 'open' },
      include: { legs: true },
    });

    if (openTrades.length === 0) {
      this.logger.log('No open positions to snapshot');
      return { snapshots_created: 0, errors: [] };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let snapshotsCreated = 0;
    const errors: string[] = [];

    for (const trade of openTrades) {
      try {
        const price = await this.polygonService.getPreviousClose(trade.symbol);
        if (price == null) {
          errors.push(`No price for ${trade.symbol}`);
          continue;
        }

        // Calculate days to earliest expiry across legs
        const legs = trade.legs as Array<{ expiration: Date }>;
        const earliestExpiry = legs.length > 0
          ? legs.reduce((min, leg) => {
              const exp = new Date(leg.expiration);
              return exp < min ? exp : min;
            }, new Date(legs[0].expiration))
          : today;

        const daysToExpiry = Math.max(
          0,
          Math.ceil((earliestExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
        );

        // Estimate mark value and Greeks from entry data
        const markValue = this.estimateMarkValue(trade as unknown as TradeForSnapshot, price);
        const pnlUnrealized = trade.entry_credit != null
          ? (trade.entry_credit - markValue) * trade.contracts * 100
          : null;

        await this.prisma.position_snapshot.create({
          data: {
            trade_id: trade.id,
            snapshot_date: today,
            underlying_price: price,
            mark_value: markValue,
            delta: this.estimatePositionDelta(trade as unknown as TradeForSnapshot, price, daysToExpiry),
            theta: this.estimatePositionTheta(trade as unknown as TradeForSnapshot, daysToExpiry),
            vega: null,
            gamma: null,
            days_to_expiry: daysToExpiry,
            pnl_unrealized: pnlUnrealized,
          },
        });

        snapshotsCreated++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Error snapshotting trade ${trade.id} (${trade.symbol}): ${message}`);
        this.logger.error(`Snapshot error for trade ${trade.id}: ${message}`);
      }
    }

    this.logger.log(`Snapshots created: ${snapshotsCreated}/${openTrades.length}`);
    return { snapshots_created: snapshotsCreated, errors };
  }

  async getPortfolioSummary(): Promise<PortfolioSummary> {
    const openTrades = await this.prisma.trade.findMany({
      where: { status: 'open' },
      include: { legs: true },
    });

    const positions = await Promise.all(
      openTrades.map(async (trade) => {
        const latestSnapshot = await this.prisma.position_snapshot.findFirst({
          where: { trade_id: trade.id },
          orderBy: { snapshot_date: 'desc' },
        });

        return {
          trade_id: trade.id,
          symbol: trade.symbol,
          strategy: trade.strategy,
          entry_credit: trade.entry_credit,
          latest_mark: latestSnapshot?.mark_value ?? null,
          pnl_unrealized: latestSnapshot?.pnl_unrealized ?? null,
          delta: latestSnapshot?.delta ?? null,
          theta: latestSnapshot?.theta ?? null,
          days_to_expiry: latestSnapshot?.days_to_expiry ?? null,
        };
      }),
    );

    const totalPnl = positions.reduce((sum, p) => sum + (p.pnl_unrealized ?? 0), 0);
    const netDelta = positions.reduce((sum, p) => sum + (p.delta ?? 0), 0);
    const totalTheta = positions.reduce((sum, p) => sum + (p.theta ?? 0), 0);

    return {
      total_pnl: totalPnl,
      net_delta: netDelta,
      total_theta: totalTheta,
      positions_count: positions.length,
      positions,
    };
  }

  async getPositionTimeline(tradeId: number): Promise<Array<{
    snapshot_date: Date;
    underlying_price: number;
    mark_value: number;
    delta: number | null;
    theta: number | null;
    days_to_expiry: number;
    pnl_unrealized: number | null;
  }>> {
    return this.prisma.position_snapshot.findMany({
      where: { trade_id: tradeId },
      orderBy: { snapshot_date: 'asc' },
      select: {
        snapshot_date: true,
        underlying_price: true,
        mark_value: true,
        delta: true,
        theta: true,
        days_to_expiry: true,
        pnl_unrealized: true,
      },
    });
  }

  private estimateMarkValue(trade: TradeForSnapshot, underlyingPrice: number): number {
    // Simplified mark estimation based on entry credit and price movement
    if (trade.entry_credit == null) return 0;

    const legs = trade.legs;
    if (legs.length === 0) return trade.entry_credit;

    // Simple linear approximation of option premium decay + directional risk
    let markEstimate = 0;
    for (const leg of legs) {
      const intrinsicValue = leg.option_type === 'put'
        ? Math.max(leg.strike - underlyingPrice, 0)
        : Math.max(underlyingPrice - leg.strike, 0);

      const expiration = new Date(leg.expiration);
      const daysLeft = Math.max(0, (expiration.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const timeValueRatio = daysLeft / 30; // normalize to ~30 DTE

      const estimatedPremium = intrinsicValue + (leg.entry_price ?? 0) * Math.sqrt(timeValueRatio);
      markEstimate += leg.side === 'sell' ? estimatedPremium : -estimatedPremium;
    }

    return Math.max(0, markEstimate);
  }

  private estimatePositionDelta(trade: TradeForSnapshot, underlyingPrice: number, dte: number): number {
    let netDelta = 0;
    for (const leg of trade.legs) {
      const delta = leg.delta_at_entry ?? (leg.option_type === 'put' ? -0.16 : 0.16);
      netDelta += leg.side === 'sell' ? -delta * leg.quantity : delta * leg.quantity;
    }
    return Math.round(netDelta * 1000) / 1000;
  }

  private estimatePositionTheta(trade: TradeForSnapshot, dte: number): number {
    if (dte <= 0) return 0;
    // Approximate theta as entry credit spread over remaining days
    const entryCredit = trade.entry_credit ?? 0;
    return Math.round((entryCredit / Math.max(dte, 1)) * 100 * trade.contracts * 100) / 100;
  }
}

interface TradeForSnapshot {
  id: number;
  symbol: string;
  strategy: string;
  entry_credit: number | null;
  contracts: number;
  legs: Array<{
    option_type: string;
    strike: number;
    expiration: Date;
    side: string;
    quantity: number;
    entry_price: number | null;
    delta_at_entry: number | null;
  }>;
}
