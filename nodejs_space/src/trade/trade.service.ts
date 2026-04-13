import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { StrategyService } from '../strategy/strategy.service.js';
import type { StrategyType, LegDefinition } from '../strategy/strategy.service.js';

export interface CreateTradeFromSignalInput {
  signal_id: number;
  contracts?: number;
  notes?: string;
}

export interface TradeWithLegs {
  id: number;
  signal_id: number | null;
  symbol: string;
  strategy: string;
  status: string;
  direction: string;
  opened_at: Date | null;
  closed_at: Date | null;
  entry_credit: number | null;
  exit_debit: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  contracts: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  legs: Array<{
    id: number;
    option_type: string;
    strike: number;
    expiration: Date;
    side: string;
    quantity: number;
    entry_price: number | null;
    exit_price: number | null;
    iv_at_entry: number | null;
    delta_at_entry: number | null;
  }>;
}

@Injectable()
export class TradeService {
  private readonly logger = new Logger(TradeService.name);

  constructor(
    private prisma: PrismaService,
    private strategyService: StrategyService,
  ) {}

  async createTradeFromSignal(input: CreateTradeFromSignalInput): Promise<TradeWithLegs> {
    const signal = await this.prisma.signal.findUnique({
      where: { id: input.signal_id },
    });

    if (!signal) {
      throw new NotFoundException(`Signal ${input.signal_id} not found`);
    }

    if (!signal.selected) {
      throw new BadRequestException(`Signal ${input.signal_id} was not selected — cannot create trade`);
    }

    const suggestion = this.strategyService.suggestStrategy({
      symbol: signal.symbol,
      atm_iv: signal.atm_iv,
      vrp_20: signal.vrp_20,
      vrp_percentile: signal.vrp_percentile,
      iv_z: signal.iv_z,
      iv_z_percentile: signal.iv_z_percentile,
    });

    const contracts = input.contracts ?? 1;

    // Calculate legs if we have ATM IV and a reasonable underlying price proxy
    let legs: LegDefinition[] = [];
    if (signal.atm_iv && signal.atm_iv > 0) {
      // Use a placeholder underlying price — in production this would come from market data
      const estimatedUnderlyingPrice = 100;
      legs = this.strategyService.calculateLegs(
        suggestion.strategy,
        estimatedUnderlyingPrice,
        signal.atm_iv,
        suggestion.target_delta_short,
        suggestion.target_delta_wing,
      );
    }

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30);

    const trade = await this.prisma.trade.create({
      data: {
        signal_id: signal.id,
        symbol: signal.symbol,
        strategy: suggestion.strategy,
        status: 'pending',
        direction: 'sell',
        contracts,
        notes: input.notes ?? suggestion.reason,
        legs: {
          create: legs.map(leg => ({
            option_type: leg.option_type,
            strike: leg.strike,
            expiration: expirationDate,
            side: leg.side,
            quantity: contracts,
            delta_at_entry: leg.delta,
          })),
        },
      },
      include: { legs: true },
    });

    this.logger.log(`Trade ${trade.id} created for ${signal.symbol} (${suggestion.strategy})`);
    return trade as TradeWithLegs;
  }

  async openTrade(tradeId: number, entryCredit?: number): Promise<TradeWithLegs> {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: { legs: true },
    });

    if (!trade) {
      throw new NotFoundException(`Trade ${tradeId} not found`);
    }

    if (trade.status !== 'pending') {
      throw new BadRequestException(`Trade ${tradeId} is ${trade.status}, expected pending`);
    }

    const updated = await this.prisma.trade.update({
      where: { id: tradeId },
      data: {
        status: 'open',
        opened_at: new Date(),
        entry_credit: entryCredit ?? null,
      },
      include: { legs: true },
    });

    this.logger.log(`Trade ${tradeId} opened`);
    return updated as TradeWithLegs;
  }

  async closeTrade(tradeId: number, exitDebit?: number): Promise<TradeWithLegs> {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: { legs: true },
    });

    if (!trade) {
      throw new NotFoundException(`Trade ${tradeId} not found`);
    }

    if (trade.status !== 'open' && trade.status !== 'closing') {
      throw new BadRequestException(`Trade ${tradeId} is ${trade.status}, expected open or closing`);
    }

    const pnl = trade.entry_credit != null && exitDebit != null
      ? (trade.entry_credit - exitDebit) * trade.contracts * 100
      : null;
    const pnlPct = pnl != null && trade.entry_credit != null && trade.entry_credit > 0
      ? (pnl / (trade.entry_credit * trade.contracts * 100)) * 100
      : null;

    const updated = await this.prisma.trade.update({
      where: { id: tradeId },
      data: {
        status: 'closed',
        closed_at: new Date(),
        exit_debit: exitDebit ?? null,
        pnl,
        pnl_pct: pnlPct,
      },
      include: { legs: true },
    });

    this.logger.log(`Trade ${tradeId} closed (P&L: ${pnl ?? 'N/A'})`);
    return updated as TradeWithLegs;
  }

  async cancelTrade(tradeId: number): Promise<TradeWithLegs> {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: { legs: true },
    });

    if (!trade) {
      throw new NotFoundException(`Trade ${tradeId} not found`);
    }

    if (trade.status === 'closed' || trade.status === 'cancelled') {
      throw new BadRequestException(`Trade ${tradeId} is already ${trade.status}`);
    }

    const updated = await this.prisma.trade.update({
      where: { id: tradeId },
      data: { status: 'cancelled' },
      include: { legs: true },
    });

    this.logger.log(`Trade ${tradeId} cancelled`);
    return updated as TradeWithLegs;
  }

  async getOpenTrades(): Promise<TradeWithLegs[]> {
    const trades = await this.prisma.trade.findMany({
      where: { status: 'open' },
      include: { legs: true },
      orderBy: { opened_at: 'desc' },
    });
    return trades as TradeWithLegs[];
  }

  async getTradeHistory(options?: {
    symbol?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ trades: TradeWithLegs[]; pagination: { page: number; limit: number; total: number; total_pages: number } }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const where: Record<string, unknown> = {};

    if (options?.symbol) where.symbol = options.symbol.toUpperCase();
    if (options?.status) where.status = options.status;

    const [trades, total] = await Promise.all([
      this.prisma.trade.findMany({
        where,
        include: { legs: true },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.trade.count({ where }),
    ]);

    return {
      trades: trades as TradeWithLegs[],
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async getTradeById(tradeId: number): Promise<TradeWithLegs> {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: { legs: true },
    });

    if (!trade) {
      throw new NotFoundException(`Trade ${tradeId} not found`);
    }

    return trade as TradeWithLegs;
  }
}
