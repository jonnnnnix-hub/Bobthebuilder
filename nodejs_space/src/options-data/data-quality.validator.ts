import { Injectable } from '@nestjs/common';
import { NormalizedOptionQuote, QualityStatus } from './types.js';

const MIN_IV = 0.01;
const MAX_IV = 5;

@Injectable()
export class OptionsDataQualityValidator {
  evaluate(quote: NormalizedOptionQuote): {
    status: QualityStatus;
    flags: string[];
    normalizedMid: number | null;
  } {
    const flags = [...quote.qualityFlags];

    if (quote.strike <= 0) {
      flags.push('invalid_strike');
    }
    if (
      quote.expiration.getTime() <
      quote.snapshotTs.getTime() - 24 * 60 * 60 * 1000
    ) {
      flags.push('expired_contract');
    }

    if (quote.bid !== null && quote.bid < 0) {
      flags.push('negative_bid');
    }
    if (quote.ask !== null && quote.ask < 0) {
      flags.push('negative_ask');
    }
    if (quote.ask !== null && quote.bid !== null && quote.ask < quote.bid) {
      flags.push('crossed_market');
    }

    if (
      quote.impliedVolatility !== null &&
      (quote.impliedVolatility < MIN_IV || quote.impliedVolatility > MAX_IV)
    ) {
      flags.push('iv_out_of_bounds');
    }

    const normalizedMid = quote.mid ?? this.computeMid(quote.bid, quote.ask);
    if (quote.mid === null && normalizedMid !== null) {
      flags.push('mid_computed_from_bid_ask');
    }

    if (
      flags.some(
        (flag) =>
          flag.startsWith('invalid_') ||
          flag === 'expired_contract' ||
          flag === 'negative_bid' ||
          flag === 'negative_ask',
      )
    ) {
      return { status: 'invalid', flags, normalizedMid };
    }
    if (flags.length > 0) {
      return { status: 'valid_with_warnings', flags, normalizedMid };
    }
    return { status: 'valid', flags, normalizedMid };
  }

  private computeMid(bid: number | null, ask: number | null): number | null {
    if (bid === null || ask === null) {
      return null;
    }
    return (bid + ask) / 2;
  }
}
