import { Injectable } from '@nestjs/common';
import { PolygonService } from '../polygon/polygon.service.js';
import { OptionsDataProvider } from './options-data.provider.js';
import {
  DataFreshnessTier,
  NormalizedOptionQuote,
  OptionsProviderSnapshotResult,
} from './types.js';

@Injectable()
export class PolygonOptionsProvider implements OptionsDataProvider {
  readonly source = 'polygon' as const;

  constructor(private readonly polygonService: PolygonService) {}

  isConfigured(): boolean {
    return this.polygonService.isConfigured();
  }

  async fetchSnapshot(params: {
    symbol: string;
    asOf: Date;
    tier: DataFreshnessTier;
  }): Promise<OptionsProviderSnapshotResult> {
    const contracts = await this.polygonService.getOptionsSnapshot(
      params.symbol,
    );
    const snapshotTs = params.asOf;

    const quotes: NormalizedOptionQuote[] = contracts.map((contract) => ({
      underlyingSymbol: params.symbol.toUpperCase(),
      optionSymbol: contract.ticker,
      expiration: new Date(`${contract.expiration_date}T00:00:00.000Z`),
      strike: contract.strike_price,
      optionType: contract.contract_type,
      snapshotTs,
      bid: null,
      ask: null,
      mid: null,
      last: contract.day?.close ?? null,
      mark: contract.day?.close ?? null,
      volume: contract.day?.volume ?? null,
      openInterest: contract.open_interest ?? null,
      impliedVolatility: contract.implied_volatility ?? null,
      delta: null,
      gamma: null,
      theta: null,
      vega: null,
      rho: null,
      source: this.source,
      qualityFlags: [],
    }));

    return {
      source: this.source,
      quotes,
      requestedAt: new Date(),
      warnings:
        params.tier === 'eod' ? ['polygon_snapshot_used_for_eod_tier'] : [],
    };
  }
}
