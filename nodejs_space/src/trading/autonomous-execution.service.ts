import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { DecisionEngineService } from './decision-engine.service.js';
import { AutonomousRiskService } from './autonomous-risk.service.js';
import { AlpacaService } from '../alpaca/alpaca.service.js';
import { TradingLoggerService } from './trading-logger.service.js';
import { ExitManagementService } from './exit-management.service.js';
import type { AccountSafetyCheck, AccountSnapshot } from './trading.types.js';

@Injectable()
export class AutonomousExecutionService {
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisionEngine: DecisionEngineService,
    private readonly riskService: AutonomousRiskService,
    private readonly alpacaService: AlpacaService,
    private readonly logger: TradingLoggerService,
    private readonly exitManager: ExitManagementService,
  ) {}

  @Interval(15000)
  async runCycle(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      if (!this.alpacaService.isConfigured()) {
        await this.logger.log(
          'warn',
          'engine_disabled',
          'Autonomous trading loop skipped: Alpaca credentials missing',
        );
        return;
      }

      const accountRaw = await this.alpacaService.getAccount();
      const gate = this.checkAccountSafety(accountRaw);
      if (!gate.safe) {
        await this.logger.log(
          'warn',
          'engine_disabled',
          `Autonomous trading loop skipped: ${gate.reasons.join('; ')}`,
          { payload: { snapshot: gate.snapshot, reasons: gate.reasons } },
        );
        await this.syncPositions();
        await this.exitManager.evaluateAndExecute();
        return;
      }

      await this.syncPositions();
      await this.evaluateEntries(gate.snapshot);
      await this.exitManager.evaluateAndExecute();
    } catch (error) {
      await this.logger.log(
        'error',
        'cycle_failed',
        `runCycle error: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  checkAccountSafety(accountRaw: Record<string, unknown>): AccountSafetyCheck {
    const snapshot: AccountSnapshot = {
      status: this.readString(accountRaw.status, 'unknown'),
      equity: this.readNumber(accountRaw.equity, 0),
      lastEquity: accountRaw.last_equity == null
        ? null
        : this.readNumber(accountRaw.last_equity, 0),
    };

    const minEquity = Number(process.env.MIN_REQUIRED_EQUITY ?? 2000);
    const maxDailyLossPct = Number(process.env.MAX_DAILY_LOSS_PCT ?? 0.03);

    const reasons: string[] = [];
    if (snapshot.status !== 'ACTIVE') {
      reasons.push(`account status is "${snapshot.status}" (expected ACTIVE)`);
    }
    if (snapshot.equity < minEquity) {
      reasons.push(
        `equity ${snapshot.equity.toFixed(2)} below minimum ${minEquity.toFixed(2)}`,
      );
    }
    if (snapshot.lastEquity && snapshot.lastEquity > 0) {
      const dailyChangePct =
        (snapshot.equity - snapshot.lastEquity) / snapshot.lastEquity;
      if (dailyChangePct < -maxDailyLossPct) {
        reasons.push(
          `daily loss ${(dailyChangePct * 100).toFixed(2)}% exceeds limit ${(maxDailyLossPct * 100).toFixed(2)}%`,
        );
      }
    }

    return { safe: reasons.length === 0, reasons, snapshot };
  }

  private async evaluateEntries(initialSnapshot: AccountSnapshot): Promise<void> {
    const portfolioKill = await this.checkPortfolioKillSwitch();
    if (portfolioKill.tripped) {
      await this.logger.log(
        'warn',
        'entry_halted',
        `Portfolio kill switch tripped: ${portfolioKill.reasons.join('; ')}`,
        { payload: { metrics: portfolioKill.metrics, reasons: portfolioKill.reasons } },
      );
      return;
    }

    const candidates = await this.prisma.signal.findMany({
      where: { selected: true },
      orderBy: { created_at: 'desc' },
      take: 20,
      select: { id: true, symbol: true },
    });

    let snapshot = initialSnapshot;

    for (const candidate of candidates) {
      const exists = await this.prisma.trade_decision.findFirst({
        where: { signal_id: candidate.id },
      });
      if (exists) continue;

      const accountRaw = await this.alpacaService.getAccount();
      const gate = this.checkAccountSafety(accountRaw);
      if (!gate.safe) {
        await this.logger.log(
          'warn',
          'entry_halted',
          `Entry halted mid-cycle: ${gate.reasons.join('; ')}`,
          { payload: { snapshot: gate.snapshot, reasons: gate.reasons } },
        );
        return;
      }
      snapshot = gate.snapshot;

      const decision = await this.decisionEngine.buildDecision(
        candidate.id,
        accountRaw,
      );
      if (!decision) continue;

      const risk = await this.riskService.evaluate(decision, snapshot);

      const decisionRow = await this.prisma.trade_decision.create({
        data: {
          signal_id: decision.signalId,
          symbol: decision.symbol,
          composite_score: decision.compositeScore,
          score_confidence: decision.scoreConfidence,
          market_regime: decision.marketRegime,
          volatility_environment: decision.volatilityEnvironment,
          selected_strategy: decision.strategy.strategy,
          strategy_scoring: this.asJson({ selected: decision.strategy, risk }),
          strike_selection: this.asJson(decision.strikeSelection),
          expiration_selection: this.asJson(decision.expirationSelection),
          position_size_usd: decision.positionSizing.notionalUsd,
          position_contracts: decision.positionSizing.contracts,
          risk_state: risk.status,
          rationale: this.asJson(decision.rationale),
        },
      });

      await this.logger.log(
        risk.approved ? 'info' : 'warn',
        'trade_decision',
        `${decision.symbol}: ${decision.strategy.strategy} ${risk.status}`,
        { symbol: decision.symbol, payload: { decision, risk } },
      );

      if (!risk.approved) continue;

      await this.submitOrderWithRetry(decisionRow.id, decision.symbol, {
        symbol: decision.symbol,
        qty: String(decision.positionSizing.contracts),
        side: decision.strategy.strategy.includes('short') ? 'sell' : 'buy',
        type: 'market',
        time_in_force: 'day',
        client_order_id: `bob-${decision.signalId}-${Date.now()}`,
      });
    }
  }

  private async submitOrderWithRetry(
    decisionId: bigint,
    symbol: string,
    payload: {
      symbol: string;
      qty: string;
      side: 'buy' | 'sell';
      type: 'market' | 'limit';
      time_in_force: 'day' | 'gtc';
      client_order_id: string;
    },
  ): Promise<void> {
    let attempts = 0;
    let lastError: string | null = null;

    while (attempts < 3) {
      attempts += 1;
      try {
        const order = await this.alpacaService.placeOrder(payload);

        await this.prisma.alpaca_order.create({
          data: {
            trade_decision_id: decisionId,
            alpaca_order_id: this.readString(order.id, ''),
            client_order_id: this.readString(
              order.client_order_id,
              payload.client_order_id,
            ),
            symbol,
            side: this.readString(order.side, payload.side),
            order_type: this.readString(order.type, payload.type),
            quantity: this.readNumber(order.qty, Number(payload.qty)),
            status: this.readString(order.status, 'accepted'),
            submitted_at: order.submitted_at
              ? new Date(this.readString(order.submitted_at, new Date().toISOString()))
              : new Date(),
            request_payload: this.asJson(payload),
            response_payload: this.asJson(order),
          },
        });

        await this.prisma.trade_decision.update({
          where: { id: decisionId },
          data: { risk_state: 'executed' },
        });

        await this.logger.log(
          'info',
          'order_submitted',
          `Order submitted for ${symbol}`,
          {
            symbol,
            payload: { attempts, orderId: this.readString(order.id, '') },
          },
        );
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (!this.isRetryableOrderError(error)) {
          await this.logger.log(
            'warn',
            'order_permanent_failure',
            `Permanent failure for ${symbol} (no retry): ${lastError}`,
            { symbol, payload: { attempts, status: this.orderErrorStatus(error) } },
          );
          break;
        }
      }
    }

    await this.prisma.trade_decision.update({
      where: { id: decisionId },
      data: { risk_state: 'blocked' },
    });
    await this.logger.log(
      'error',
      'order_failed',
      `Order failed for ${symbol} after retries: ${lastError}`,
      { symbol },
    );
  }

  isRetryableOrderError(error: unknown): boolean {
    const status = this.orderErrorStatus(error);
    if (status === undefined) return true;
    if (status === 429) return true;
    if (status >= 500) return true;
    return false;
  }

  private orderErrorStatus(error: unknown): number | undefined {
    const response = (error as { response?: { status?: unknown } })?.response;
    if (!response) return undefined;
    const status = response.status;
    return typeof status === 'number' ? status : undefined;
  }

  private async syncPositions(): Promise<void> {
    const positions = await this.alpacaService.getPositions();

    for (const position of positions) {
      const symbol = this.readString(position.symbol, '');
      const opening = await this.findOpeningDecision(symbol);

      await this.prisma.position_monitoring.create({
        data: {
          alpaca_position_id: this.readString(
            position.asset_id ?? position.symbol,
            symbol,
          ),
          symbol,
          strategy: opening?.selected_strategy ?? null,
          trade_decision_id: opening?.id ?? null,
          quantity: this.readNumber(position.qty, 0),
          avg_entry_price: this.readNumber(position.avg_entry_price, 0),
          current_price: this.readNumber(position.current_price, 0),
          market_value: this.readNumber(position.market_value, 0),
          unrealized_pl: this.readNumber(position.unrealized_pl, 0),
          unrealized_pl_pct: this.readNumber(position.unrealized_plpc, 0),
          realized_pl: this.readNumber(position.realized_pl, 0),
          delta: this.readNumber(position.delta, 0),
          gamma: this.readNumber(position.gamma, 0),
          theta: this.readNumber(position.theta, 0),
          vega: this.readNumber(position.vega, 0),
          dte_remaining: position.dte
            ? this.readNumber(position.dte, 0)
            : null,
          exit_criteria_status: {
            pnl: this.readNumber(position.unrealized_plpc, 0),
            dte: position.dte ? this.readNumber(position.dte, 0) : null,
          },
          last_synced_at: new Date(),
        },
      });
    }
  }

  async checkPortfolioKillSwitch(): Promise<{
    tripped: boolean;
    reasons: string[];
    metrics: {
      maxSymbolConcentration: number | null;
      portfolioHeatPct: number | null;
    };
  }> {
    const latest = await this.prisma.risk_metrics.findFirst({
      orderBy: { created_at: 'desc' },
      select: {
        max_symbol_concentration: true,
        portfolio_heat_pct: true,
      },
    });

    const concentrationLimit = Number(
      process.env.KILL_SWITCH_MAX_CONCENTRATION ?? 0.4,
    );
    const heatLimit = Number(process.env.KILL_SWITCH_MAX_HEAT ?? 0.25);

    const concentration =
      latest?.max_symbol_concentration == null
        ? null
        : Number(latest.max_symbol_concentration);
    const heat =
      latest?.portfolio_heat_pct == null
        ? null
        : Number(latest.portfolio_heat_pct);

    const reasons: string[] = [];
    if (concentration !== null && concentration > concentrationLimit) {
      reasons.push(
        `symbol concentration ${concentration.toFixed(3)} exceeds kill-switch limit ${concentrationLimit.toFixed(3)}`,
      );
    }
    if (heat !== null && heat > heatLimit) {
      reasons.push(
        `portfolio heat ${heat.toFixed(3)} exceeds kill-switch limit ${heatLimit.toFixed(3)}`,
      );
    }

    return {
      tripped: reasons.length > 0,
      reasons,
      metrics: {
        maxSymbolConcentration: concentration,
        portfolioHeatPct: heat,
      },
    };
  }

  private async findOpeningDecision(
    symbol: string,
  ): Promise<{ id: bigint; selected_strategy: string } | null> {
    const order = await this.prisma.alpaca_order.findFirst({
      where: {
        symbol,
        trade_decision_id: { not: null },
        status: { in: ['filled', 'partially_filled'] },
      },
      orderBy: { created_at: 'desc' },
      select: { trade_decision_id: true },
    });
    if (!order?.trade_decision_id) return null;

    const decision = await this.prisma.trade_decision.findUnique({
      where: { id: order.trade_decision_id },
      select: { id: true, selected_strategy: true },
    });
    return decision;
  }

  private asJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private readString(value: unknown, fallback: string): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return fallback;
  }

  private readNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
