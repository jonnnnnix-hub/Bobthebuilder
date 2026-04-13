import { Injectable, Logger } from '@nestjs/common';
import { OptionsDataQualityValidator } from './data-quality.validator.js';
import { OratsOptionsProvider } from './orats-options.provider.js';
import { PolygonOptionsProvider } from './polygon-options.provider.js';
import {
  buildContractKey,
  DataFreshnessTier,
  MergedOptionsSnapshot,
  NormalizedOptionQuote,
  OptionsDataSource,
} from './types.js';

@Injectable()
export class OptionsDataService {
  private readonly logger = new Logger(OptionsDataService.name);

  constructor(
    private readonly polygonProvider: PolygonOptionsProvider,
    private readonly oratsProvider: OratsOptionsProvider,
    private readonly qualityValidator: OptionsDataQualityValidator,
  ) {}

  async fetchMergedSnapshot(params: {
    symbol: string;
    asOf: Date;
    tier: DataFreshnessTier;
    preferredPrimary?: OptionsDataSource;
  }): Promise<MergedOptionsSnapshot> {
    const primary = params.preferredPrimary ?? 'polygon';
    const providers = this.resolveProviderOrder(primary);

    const [first, second] = await Promise.all([
      providers[0].fetchSnapshot({
        symbol: params.symbol,
        asOf: params.asOf,
        tier: params.tier,
      }),
      providers[1].fetchSnapshot({
        symbol: params.symbol,
        asOf: params.asOf,
        tier: params.tier,
      }),
    ]);

    const mergedByContract = new Map<string, NormalizedOptionQuote>();

    this.mergeProviderRows(mergedByContract, first.quotes, first.source);
    this.mergeProviderRows(mergedByContract, second.quotes, second.source);

    const mergedQuotes = [...mergedByContract.values()];
    const qualitySummary = { valid: 0, validWithWarnings: 0, invalid: 0 };

    for (const quote of mergedQuotes) {
      const evaluation = this.qualityValidator.evaluate(quote);
      quote.qualityFlags = evaluation.flags;
      quote.mid = evaluation.normalizedMid;
      if (evaluation.status === 'valid') {
        qualitySummary.valid += 1;
      } else if (evaluation.status === 'valid_with_warnings') {
        qualitySummary.validWithWarnings += 1;
      } else {
        qualitySummary.invalid += 1;
      }
    }

    if (mergedQuotes.length === 0) {
      this.logger.warn(
        `No option quotes returned for ${params.symbol} (${params.tier})`,
      );
    }

    return {
      underlyingSymbol: params.symbol.toUpperCase(),
      snapshotDate: new Date(
        `${params.asOf.toISOString().slice(0, 10)}T00:00:00.000Z`,
      ),
      snapshotTs: params.asOf,
      freshnessTier: params.tier,
      mergedQuotes,
      sourcesUsed: [first.source, second.source].filter(
        (value, index, arr) => arr.indexOf(value) === index,
      ),
      primarySource: first.source,
      secondarySource: second.source,
      qualitySummary,
    };
  }

  private resolveProviderOrder(
    primary: OptionsDataSource,
  ): [
    PolygonOptionsProvider | OratsOptionsProvider,
    PolygonOptionsProvider | OratsOptionsProvider,
  ] {
    if (primary === 'orats') {
      return [this.oratsProvider, this.polygonProvider];
    }
    return [this.polygonProvider, this.oratsProvider];
  }

  private mergeProviderRows(
    target: Map<string, NormalizedOptionQuote>,
    quotes: NormalizedOptionQuote[],
    source: OptionsDataSource,
  ): void {
    for (const quote of quotes) {
      const key = buildContractKey({
        underlyingSymbol: quote.underlyingSymbol,
        expiration: quote.expiration,
        strike: quote.strike,
        optionType: quote.optionType,
      });

      const existing = target.get(key);
      if (!existing) {
        target.set(key, quote);
        continue;
      }

      target.set(key, this.mergeQuoteFields(existing, quote, source));
    }
  }

  private mergeQuoteFields(
    existing: NormalizedOptionQuote,
    incoming: NormalizedOptionQuote,
    incomingSource: OptionsDataSource,
  ): NormalizedOptionQuote {
    const preferIncomingForIv = incomingSource === 'orats';
    const preferIncomingForMarket = incomingSource === 'polygon';

    return {
      ...existing,
      source: existing.source,
      bid: preferIncomingForMarket
        ? (incoming.bid ?? existing.bid)
        : (existing.bid ?? incoming.bid),
      ask: preferIncomingForMarket
        ? (incoming.ask ?? existing.ask)
        : (existing.ask ?? incoming.ask),
      last: preferIncomingForMarket
        ? (incoming.last ?? existing.last)
        : (existing.last ?? incoming.last),
      mark: preferIncomingForMarket
        ? (incoming.mark ?? existing.mark)
        : (existing.mark ?? incoming.mark),
      volume: preferIncomingForMarket
        ? (incoming.volume ?? existing.volume)
        : (existing.volume ?? incoming.volume),
      openInterest: preferIncomingForIv
        ? (incoming.openInterest ?? existing.openInterest)
        : (existing.openInterest ?? incoming.openInterest),
      impliedVolatility: preferIncomingForIv
        ? (incoming.impliedVolatility ?? existing.impliedVolatility)
        : (existing.impliedVolatility ?? incoming.impliedVolatility),
      delta: preferIncomingForIv
        ? (incoming.delta ?? existing.delta)
        : (existing.delta ?? incoming.delta),
      gamma: preferIncomingForIv
        ? (incoming.gamma ?? existing.gamma)
        : (existing.gamma ?? incoming.gamma),
      theta: preferIncomingForIv
        ? (incoming.theta ?? existing.theta)
        : (existing.theta ?? incoming.theta),
      vega: preferIncomingForIv
        ? (incoming.vega ?? existing.vega)
        : (existing.vega ?? incoming.vega),
      rho: preferIncomingForIv
        ? (incoming.rho ?? existing.rho)
        : (existing.rho ?? incoming.rho),
      qualityFlags: [...existing.qualityFlags, ...incoming.qualityFlags],
    };
  }
}
