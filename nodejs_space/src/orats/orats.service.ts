import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

type OratsResponse<T> = {
  data?: T[];
};

type OratsSummaryRow = {
  tradeDate?: string;
  iv30d?: number | null;
};

@Injectable()
export class OratsService {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;
  private readonly symbolOverrides: Map<string, string[]>;
  private static readonly SUMMARY_FIELDS = 'tradeDate,iv30d';
  private static readonly DEFAULT_SYMBOL_OVERRIDES: Record<string, string[]> = {
    'BRK.B': ['BRK-B', 'BRKB'],
  };

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ORATS_API_KEY') ?? '';
    this.symbolOverrides = this.parseSymbolOverrides(
      this.configService.get<string>('ORATS_SYMBOL_OVERRIDES'),
    );
    this.client = axios.create({
      baseURL: 'https://api.orats.io/datav2',
      timeout: 30000,
    });
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  async getCurrentIv30d(symbol: string): Promise<number | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const rows = await this.requestSummaryRows('/live/summaries', symbol);
      const row = rows[0];
      const liveIv = this.parseIv(row?.iv30d);
      if (liveIv !== null) {
        return liveIv;
      }
    } catch {
      // Fall back to historical summary data below.
    }

    const history = await this.getHistoricalIv30dSeries(
      symbol,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      1,
    );
    return history[0] ?? null;
  }

  async getHistoricalIv30dSeries(
    symbol: string,
    asOfDate: Date,
    lookbackObservations: number = 60,
  ): Promise<number[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const rows = await this.requestSummaryRows('/hist/summaries', symbol);
    return rows
      .map((row) => ({
        tradeDate: this.parseDay(row.tradeDate),
        iv30d: this.parseIv(row.iv30d),
      }))
      .filter((row): row is { tradeDate: Date; iv30d: number } =>
        Boolean(row.tradeDate && row.iv30d !== null),
      )
      .filter((row) => row.tradeDate < asOfDate)
      .sort(
        (left, right) => right.tradeDate.getTime() - left.tradeDate.getTime(),
      )
      .slice(0, lookbackObservations)
      .map((row) => row.iv30d);
  }

  private async requestSummaryRows(
    path: '/live/summaries' | '/hist/summaries',
    symbol: string,
  ): Promise<OratsSummaryRow[]> {
    let lastNotFoundError: unknown = null;

    for (const ticker of this.getTickerCandidates(symbol)) {
      try {
        const response = await this.client.get<OratsResponse<OratsSummaryRow>>(
          path,
          {
            params: {
              token: this.apiKey,
              ticker,
              fields: OratsService.SUMMARY_FIELDS,
            },
          },
        );

        const rows = response.data?.data ?? [];
        if (rows.length > 0) {
          return rows;
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          lastNotFoundError = error;
          continue;
        }

        throw error;
      }
    }

    if (lastNotFoundError) {
      throw lastNotFoundError;
    }

    return [];
  }

  private getTickerCandidates(symbol: string): string[] {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      return [];
    }

    const configuredOverrides =
      this.symbolOverrides.get(normalized) ??
      OratsService.DEFAULT_SYMBOL_OVERRIDES[normalized] ??
      [];
    const candidates = [...configuredOverrides, normalized];
    if (/[./]/.test(normalized)) {
      candidates.push(normalized.replace(/[./]/g, '-'));
      candidates.push(normalized.replace(/[.\-/]/g, ''));
    }

    return [...new Set(candidates.filter(Boolean))];
  }

  private parseSymbolOverrides(
    rawValue: string | undefined,
  ): Map<string, string[]> {
    const overrides = new Map<string, string[]>();
    if (!rawValue) {
      return overrides;
    }

    for (const segment of rawValue.split(';')) {
      const [rawSymbol, rawTargets] = segment.split('=');
      const symbol = rawSymbol?.trim().toUpperCase();
      if (!symbol || !rawTargets) {
        continue;
      }

      const targets = rawTargets
        .split('|')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
      if (targets.length > 0) {
        overrides.set(symbol, [...new Set(targets)]);
      }
    }

    return overrides;
  }

  private parseIv(value: number | null | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : null;
  }

  private parseDay(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }

    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00.000Z`
      : value;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
