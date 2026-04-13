import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface OptionContract {
  ticker: string;
  strike_price: number;
  expiration_date: string;
  contract_type: 'call' | 'put';
  implied_volatility?: number;
  open_interest?: number;
  day?: { close?: number; volume?: number };
  details?: { strike_price?: number; expiration_date?: string; contract_type?: string };
}

export interface DailyBar {
  c: number; // close
  h: number; // high
  l: number; // low
  o: number; // open
  v: number; // volume
  t: number; // timestamp ms
}

@Injectable()
export class PolygonService {
  private readonly logger = new Logger(PolygonService.name);
  private readonly client: AxiosInstance;
  private readonly apiKey: string;
  private static readonly MIN_DTE = 15;
  private static readonly MAX_DTE = 50;
  private static readonly TARGETED_STRIKE_WINDOWS = [0.08, 0.15, 0.3];

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('POLYGON_API_KEY') ?? '';
    this.client = axios.create({
      baseURL: 'https://api.polygon.io',
      timeout: 30000,
      params: { apiKey: this.apiKey },
    });
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  /**
   * Fetch options snapshot for a given underlying ticker.
   * Returns all option contracts with their current IV and pricing.
   */
  async getOptionsSnapshot(underlyingTicker: string, currentPrice?: number | null): Promise<OptionContract[]> {
    try {
      const expirationParams = this.buildExpirationFilters();
      const targetedContracts = new Map<string, OptionContract>();

      if (typeof currentPrice === 'number' && Number.isFinite(currentPrice) && currentPrice > 0) {
        for (const widthPct of PolygonService.TARGETED_STRIKE_WINDOWS) {
          const strikeRadius = Math.max(currentPrice * widthPct, 1);
          const contracts = await this.fetchSnapshotContracts(
            underlyingTicker,
            {
              ...expirationParams,
              'strike_price.gte': this.roundStrike(Math.max(currentPrice - strikeRadius, 0.01)),
              'strike_price.lte': this.roundStrike(currentPrice + strikeRadius),
            },
            6,
          );

          this.addContracts(targetedContracts, contracts);
          if (this.hasViableAtmPairs([...targetedContracts.values()], currentPrice)) {
            const filteredContracts = [...targetedContracts.values()];
            this.logger.log(`Fetched ${filteredContracts.length} targeted option contracts for ${underlyingTicker}`);
            return filteredContracts;
          }
        }
      }

      const broadContracts = await this.fetchSnapshotContracts(underlyingTicker, expirationParams, 8);
      this.addContracts(targetedContracts, broadContracts);

      const allContracts = [...targetedContracts.values()];
      this.logger.log(`Fetched ${allContracts.length} option contracts for ${underlyingTicker}`);
      return allContracts;
    } catch (error: any) {
      this.logger.error(`Failed to fetch options snapshot for ${underlyingTicker}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the previous day's close price for a ticker.
   */
  async getPreviousClose(ticker: string): Promise<number | null> {
    try {
      const response = await this.client.get(`/v2/aggs/ticker/${ticker}/prev`);
      const results = response.data?.results;
      if (results && results.length > 0) {
        return results[0].c;
      }
      return null;
    } catch (error: any) {
      this.logger.error(`Failed to fetch previous close for ${ticker}: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch historical daily bars for a ticker.
   * Used for historical volatility calculation.
   */
  async getHistoricalBars(ticker: string, days: number): Promise<DailyBar[]> {
    try {
      // Request extra days to account for weekends/holidays
      const calendarDays = Math.ceil(days * 1.6) + 10;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - calendarDays);

      const from = startDate.toISOString().split('T')[0];
      const to = endDate.toISOString().split('T')[0];

      const response = await this.client.get(
        `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`,
        { params: { adjusted: true, sort: 'asc', limit: 5000, apiKey: this.apiKey } }
      );

      const results: DailyBar[] = response.data?.results ?? [];
      this.logger.debug(`Fetched ${results.length} daily bars for ${ticker}`);
      return results;
    } catch (error: any) {
      this.logger.error(`Failed to fetch historical bars for ${ticker}: ${error.message}`);
      return [];
    }
  }

  async getHistoricalBarsRange(ticker: string, fromDate: Date, toDate: Date): Promise<DailyBar[]> {
    try {
      const from = this.formatDate(fromDate);
      const to = this.formatDate(toDate);

      const response = await this.client.get(
        `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`,
        { params: { adjusted: true, sort: 'asc', limit: 5000, apiKey: this.apiKey } },
      );

      const results: DailyBar[] = response.data?.results ?? [];
      this.logger.debug(`Fetched ${results.length} ranged daily bars for ${ticker} (${from} -> ${to})`);
      return results;
    } catch (error: any) {
      this.logger.error(`Failed to fetch historical bar range for ${ticker}: ${error.message}`);
      return [];
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchSnapshotContracts(
    underlyingTicker: string,
    initialParams: Record<string, string | number>,
    maxPages: number,
  ): Promise<OptionContract[]> {
    const contracts: OptionContract[] = [];
    let url = `/v3/snapshot/options/${underlyingTicker}`;
    let pageCount = 0;

    while (url && pageCount < maxPages) {
      const response = await this.client.get(url, {
        params: pageCount === 0 ? { ...initialParams, limit: 250, apiKey: this.apiKey } : { apiKey: this.apiKey },
      });
      const data = response.data;

      if (data.results) {
        for (const result of data.results) {
          contracts.push({
            ticker: result.details?.ticker ?? '',
            strike_price: result.details?.strike_price ?? 0,
            expiration_date: result.details?.expiration_date ?? '',
            contract_type: result.details?.contract_type === 'call' ? 'call' : 'put',
            implied_volatility: result.implied_volatility ?? undefined,
            open_interest: result.open_interest ?? 0,
            day: result.day,
          });
        }
      }

      url = data.next_url ?? null;
      pageCount++;
      if (url) {
        await this.delay(250);
      }
    }

    return contracts;
  }

  private buildExpirationFilters(): Record<string, string> {
    const minExpiration = new Date();
    minExpiration.setDate(minExpiration.getDate() + PolygonService.MIN_DTE);

    const maxExpiration = new Date();
    maxExpiration.setDate(maxExpiration.getDate() + PolygonService.MAX_DTE);

    return {
      'expiration_date.gte': this.formatDate(minExpiration),
      'expiration_date.lte': this.formatDate(maxExpiration),
    };
  }

  private hasViableAtmPairs(options: OptionContract[], currentPrice: number): boolean {
    const now = new Date();
    const pairedKeys = new Set<string>();

    for (const option of options) {
      if (!option.implied_volatility || option.implied_volatility <= 0) {
        continue;
      }

      const expiration = new Date(option.expiration_date);
      const dte = (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (dte < PolygonService.MIN_DTE || dte > PolygonService.MAX_DTE) {
        continue;
      }

      const strikeDistancePct = Math.abs(option.strike_price - currentPrice) / currentPrice;
      if (strikeDistancePct > 0.15) {
        continue;
      }

      pairedKeys.add(`${option.expiration_date}:${option.strike_price}:${option.contract_type}`);
      if (
        pairedKeys.has(`${option.expiration_date}:${option.strike_price}:call`) &&
        pairedKeys.has(`${option.expiration_date}:${option.strike_price}:put`)
      ) {
        return true;
      }
    }

    return false;
  }

  private addContracts(target: Map<string, OptionContract>, contracts: OptionContract[]): void {
    for (const contract of contracts) {
      if (contract.ticker) {
        target.set(contract.ticker, contract);
      }
    }
  }

  private formatDate(value: Date): string {
    return value.toISOString().split('T')[0];
  }

  private roundStrike(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
