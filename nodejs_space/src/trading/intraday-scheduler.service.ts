import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalysisService } from '../analysis/analysis.service.js';

@Injectable()
export class IntradaySchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntradaySchedulerService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly analysisService: AnalysisService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log(
        'Intraday scheduler disabled (INTRADAY_ENABLED is not "true")',
      );
      return;
    }

    const intervalMs = this.getIntervalMs();
    this.intervalHandle = setInterval(() => void this.tick(), intervalMs);
    this.logger.log(
      `Intraday scheduler started — running every ${intervalMs / 60_000} min during market hours`,
    );
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.isRunning) return;
    if (!this.isMarketOpen()) return;

    this.isRunning = true;
    const start = Date.now();
    try {
      this.logger.log('Intraday analysis cycle starting');
      const result = await this.analysisService.runAnalysis('intraday');
      this.logger.log(
        `Intraday analysis completed in ${Date.now() - start}ms — ` +
          `${result.symbols_analyzed} symbols, ${result.signals_generated} signals selected: [${result.selected.join(', ')}]`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Intraday analysis failed: ${message}`);
    } finally {
      this.isRunning = false;
    }
  }

  private isEnabled(): boolean {
    return (
      this.configService.get<string>('INTRADAY_ENABLED', 'true').toLowerCase() ===
      'true'
    );
  }

  private getIntervalMs(): number {
    const minutes = Number.parseInt(
      this.configService.get<string>('INTRADAY_INTERVAL_MINUTES', '5'),
      10,
    );
    const clamped = Number.isFinite(minutes) && minutes >= 1 ? minutes : 5;
    return clamped * 60_000;
  }

  private isMarketOpen(): boolean {
    const now = new Date();

    const day = now.getDay();
    if (day === 0 || day === 6) return false;

    const etNow = new Date(
      now.toLocaleString('en-US', { timeZone: 'America/New_York' }),
    );
    const hour = etNow.getHours();
    const minute = etNow.getMinutes();
    const timeMinutes = hour * 60 + minute;

    const marketOpen = 9 * 60 + 30; // 9:30 AM ET
    const marketClose = 16 * 60; // 4:00 PM ET

    return timeMinutes >= marketOpen && timeMinutes < marketClose;
  }
}
