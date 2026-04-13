import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { OptionsDataProvider } from './options-data.provider.js';
import {
  DataFreshnessTier,
  NormalizedOptionQuote,
  OptionType,
  OptionsProviderSnapshotResult,
} from './types.js';

type OratsChainRow = {
  tradeDate?: string;
  expiry?: string;
  strike?: number;
  type?: string;
  callPut?: string;
  putCall?: string;
  bid?: number;
  ask?: number;
  mid?: number;
  mark?: number;
  last?: number;
  iv?: number;
  impliedVolatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  rho?: number;
  volume?: number;
  openInterest?: number;
  optionSymbol?: string;
  occSymbol?: string;
};

type OratsResponse<T> = { data?: T[] };

@Injectable()
export class OratsOptionsProvider implements OptionsDataProvider {
  readonly source = 'orats' as const;
  private readonly logger = new Logger(OratsOptionsProvider.name);
  private readonly apiKey: string;
  private readonly client: AxiosInstance;
  private readonly chainPath: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ORATS_API_KEY') ?? '';
    this.chainPath =
      this.configService.get<string>('ORATS_OPTIONS_CHAIN_PATH') ??
      '/hist/strikes';
    this.client = axios.create({
      baseURL: 'https://api.orats.io/datav2',
      timeout: 30000,
    });
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  async fetchSnapshot(params: {
    symbol: string;
    asOf: Date;
    tier: DataFreshnessTier;
  }): Promise<OptionsProviderSnapshotResult> {
    if (!this.isConfigured()) {
      return {
        source: this.source,
        quotes: [],
        requestedAt: new Date(),
        warnings: ['orats_not_configured'],
      };
    }

    try {
      const response = await this.client.get<OratsResponse<OratsChainRow>>(
        this.chainPath,
        {
          params: {
            token: this.apiKey,
            ticker: params.symbol,
            tradeDate: params.asOf.toISOString().slice(0, 10),
          },
        },
      );

      const quotes = (response.data?.data ?? [])
        .map((row) => this.mapRow(params.symbol, params.asOf, row))
        .filter((row): row is NormalizedOptionQuote => row !== null);

      return {
        source: this.source,
        quotes,
        requestedAt: new Date(),
        warnings:
          params.tier === 'streaming'
            ? ['orats_snapshot_not_true_streaming']
            : [],
      };
    } catch (error) {
      this.logger.warn(
        `ORATS options snapshot unavailable for ${params.symbol}: ${error instanceof Error ? error.message : 'unknown_error'}`,
      );
      return {
        source: this.source,
        quotes: [],
        requestedAt: new Date(),
        warnings: ['orats_request_failed'],
      };
    }
  }

  private mapRow(
    symbol: string,
    asOf: Date,
    row: OratsChainRow,
  ): NormalizedOptionQuote | null {
    const strike = typeof row.strike === 'number' ? row.strike : null;
    const expirationRaw = row.expiry;
    if (!strike || !expirationRaw) {
      return null;
    }

    const optionType = this.parseOptionType(row);
    if (!optionType) {
      return null;
    }

    const expiration = new Date(`${expirationRaw}T00:00:00.000Z`);
    if (Number.isNaN(expiration.getTime())) {
      return null;
    }

    const optionSymbol =
      row.optionSymbol ??
      row.occSymbol ??
      `${symbol}_${expirationRaw}_${strike}_${optionType}`;

    return {
      underlyingSymbol: symbol.toUpperCase(),
      optionSymbol,
      expiration,
      strike,
      optionType,
      snapshotTs: asOf,
      bid: this.asFinite(row.bid),
      ask: this.asFinite(row.ask),
      mid: this.asFinite(row.mid),
      last: this.asFinite(row.last),
      mark: this.asFinite(row.mark),
      volume: this.asInt(row.volume),
      openInterest: this.asInt(row.openInterest),
      impliedVolatility: this.asFinite(row.impliedVolatility ?? row.iv),
      delta: this.asFinite(row.delta),
      gamma: this.asFinite(row.gamma),
      theta: this.asFinite(row.theta),
      vega: this.asFinite(row.vega),
      rho: this.asFinite(row.rho),
      source: this.source,
      qualityFlags: [],
    };
  }

  private parseOptionType(row: OratsChainRow): OptionType | null {
    const raw = (row.type ?? row.callPut ?? row.putCall ?? '')
      .toString()
      .toLowerCase();
    if (raw.startsWith('c')) {
      return 'call';
    }
    if (raw.startsWith('p')) {
      return 'put';
    }
    return null;
  }

  private asFinite(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private asInt(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    return Math.trunc(value);
  }
}
