import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { AlpacaService } from '../alpaca/alpaca.service.js';
import { TradingLoggerService } from './trading-logger.service.js';

const NON_TERMINAL_STATUSES = [
  'new',
  'accepted',
  'pending_new',
  'pending_replace',
  'pending_cancel',
  'partially_filled',
  'accepted_for_bidding',
];

@Injectable()
export class OrderReconciliationService {
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly alpacaService: AlpacaService,
    private readonly logger: TradingLoggerService,
  ) {}

  @Interval(30000)
  async reconcile(): Promise<void> {
    if (this.isRunning) return;
    if (!this.alpacaService.isConfigured()) return;
    this.isRunning = true;
    try {
      await this.reconcileOpenOrders();
    } catch (error) {
      await this.logger.log(
        'error',
        'order_reconciliation_failed',
        `reconcile error: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  async reconcileOpenOrders(): Promise<number> {
    const openOrders = await this.prisma.alpaca_order.findMany({
      where: {
        status: { in: NON_TERMINAL_STATUSES },
        alpaca_order_id: { not: null },
      },
      take: 100,
      orderBy: { created_at: 'asc' },
    });

    let updated = 0;
    for (const row of openOrders) {
      if (!row.alpaca_order_id) continue;
      try {
        const latest = await this.alpacaService.getOrder(row.alpaca_order_id);
        const nextStatus = this.readString(latest.status, row.status);
        const filledAtRaw = this.readString(latest.filled_at, '');
        const filledAt = filledAtRaw ? new Date(filledAtRaw) : null;
        const filledQty = this.readNullableNumber(latest.filled_qty);
        const filledAvg = this.readNullableNumber(latest.filled_avg_price);

        if (
          nextStatus !== row.status ||
          filledAt !== null ||
          filledQty !== null ||
          filledAvg !== null
        ) {
          await this.prisma.alpaca_order.update({
            where: { id: row.id },
            data: {
              status: nextStatus,
              filled_at: filledAt,
              filled_quantity: filledQty,
              filled_avg_price: filledAvg,
            },
          });
          updated += 1;
        }
      } catch (error) {
        await this.logger.log(
          'warn',
          'order_reconciliation_failed',
          `Could not reconcile order ${row.alpaca_order_id}: ${error instanceof Error ? error.message : String(error)}`,
          { symbol: row.symbol },
        );
      }
    }

    return updated;
  }

  private readString(value: unknown, fallback: string): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return fallback;
  }

  private readNullableNumber(value: unknown): number | null {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
