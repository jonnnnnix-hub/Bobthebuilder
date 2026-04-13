import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AlpacaService } from '../alpaca/alpaca.service.js';
import { TradingLoggerService } from './trading-logger.service.js';

@Injectable()
export class ExitManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alpacaService: AlpacaService,
    private readonly logger: TradingLoggerService,
  ) {}

  async evaluateAndExecute(): Promise<void> {
    const latestSnapshots = await this.prisma.position_monitoring.findMany({
      orderBy: { last_synced_at: 'desc' },
      take: 200,
    });

    const latestBySymbol = new Map<string, (typeof latestSnapshots)[number]>();
    for (const row of latestSnapshots) {
      if (!latestBySymbol.has(row.symbol)) latestBySymbol.set(row.symbol, row);
    }

    for (const position of latestBySymbol.values()) {
      const trigger = await this.resolveTrigger(position);
      if (!trigger) continue;

      const signal = await this.prisma.exit_signal.create({
        data: {
          position_monitoring_id: position.id,
          trigger_type: trigger.type,
          trigger_value: trigger.value,
          threshold_value: trigger.threshold,
          rationale: trigger.rationale,
          executed: false,
        },
      });

      try {
        await this.alpacaService.closePosition(position.symbol);
        await this.prisma.exit_signal.update({
          where: { id: signal.id },
          data: { executed: true, executed_at: new Date() },
        });
        await this.logger.log(
          'info',
          'exit_executed',
          `Executed exit for ${position.symbol} (${trigger.type})`,
          { symbol: position.symbol, payload: trigger },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.logger.log(
          'error',
          'exit_error',
          `Failed exit for ${position.symbol}: ${message}`,
          { symbol: position.symbol, payload: trigger },
        );
      }
    }
  }

  private async resolveTrigger(position: {
    symbol: string;
    unrealized_pl_pct: import('@prisma/client/runtime/library').Decimal | null;
    dte_remaining: number | null;
    strategy: string | null;
  }): Promise<{
    type: string;
    value: number;
    threshold: number;
    rationale: string;
  } | null> {
    const unrealizedPct = Number(position.unrealized_pl_pct ?? 0);

    if (unrealizedPct <= -0.25) {
      return {
        type: 'stop_loss',
        value: unrealizedPct,
        threshold: -0.25,
        rationale: 'Unrealized loss breached dynamic stop',
      };
    }

    if (unrealizedPct >= 0.35) {
      return {
        type: 'profit_target',
        value: unrealizedPct,
        threshold: 0.35,
        rationale: 'Dynamic profit target reached',
      };
    }

    if ((position.dte_remaining ?? 999) <= 3) {
      return {
        type: 'theta_decay',
        value: Number(position.dte_remaining ?? 0),
        threshold: 3,
        rationale: 'Remaining DTE below threshold, decay risk elevated',
      };
    }

    const signal = await this.prisma.signal.findFirst({
      where: { symbol: position.symbol },
      orderBy: { created_at: 'desc' },
      select: { composite_score_normalized: true },
    });

    if ((signal?.composite_score_normalized ?? 100) < 45) {
      return {
        type: 'score_decay',
        value: Number(signal?.composite_score_normalized ?? 0),
        threshold: 45,
        rationale: 'Signal score decayed below continuation threshold',
      };
    }

    return null;
  }
}
