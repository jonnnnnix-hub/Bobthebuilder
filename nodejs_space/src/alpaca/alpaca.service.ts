import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AlpacaOrderRequest } from './alpaca.types.js';

@Injectable()
export class AlpacaService {
  private readonly logger = new Logger(AlpacaService.name);
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const baseURL =
      this.config.get<string>('ALPACA_PAPER_BASE_URL') ??
      'https://paper-api.alpaca.markets';

    const isPaper = /paper-api\.alpaca\.markets/i.test(baseURL);
    const allowLive = this.config.get<string>('ALLOW_LIVE_TRADING') === 'true';
    if (!isPaper && !allowLive) {
      throw new Error(
        `AlpacaService refusing to start: baseURL "${baseURL}" is not the paper endpoint and ALLOW_LIVE_TRADING is not "true".`,
      );
    }
    this.logger.log(
      isPaper
        ? `Alpaca configured for PAPER trading (${baseURL})`
        : `Alpaca configured for LIVE trading (${baseURL}) — ALLOW_LIVE_TRADING=true`,
    );

    this.http = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'APCA-API-KEY-ID': this.config.get<string>('ALPACA_API_KEY') ?? '',
        'APCA-API-SECRET-KEY':
          this.config.get<string>('ALPACA_API_SECRET') ?? '',
      },
    });
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('ALPACA_API_KEY') &&
        this.config.get<string>('ALPACA_API_SECRET'),
    );
  }

  async getAccount(): Promise<Record<string, unknown>> {
    const response = await this.http.get<unknown>('/v2/account');
    const data = this.asRecord(response.data);

    await this.prisma.alpaca_account.upsert({
      where: { account_id: this.toSafeString(data.id, 'unknown-account') },
      update: {
        status: this.toSafeString(data.status, 'unknown'),
        currency: this.toSafeString(data.currency, 'USD'),
        equity: this.toNullableNumber(data.equity),
        cash: this.toNullableNumber(data.cash),
        buying_power: this.toNullableNumber(data.buying_power),
        daytrade_count: this.toNullableInteger(data.daytrade_count),
        raw_payload: this.toJson(data),
        synced_at: new Date(),
      },
      create: {
        account_id: this.toSafeString(data.id, 'unknown-account'),
        status: this.toSafeString(data.status, 'unknown'),
        currency: this.toSafeString(data.currency, 'USD'),
        equity: this.toNullableNumber(data.equity),
        cash: this.toNullableNumber(data.cash),
        buying_power: this.toNullableNumber(data.buying_power),
        daytrade_count: this.toNullableInteger(data.daytrade_count),
        raw_payload: this.toJson(data),
      },
    });

    return data;
  }

  async getPositions(): Promise<Array<Record<string, unknown>>> {
    const response = await this.http.get<unknown>('/v2/positions');
    return this.asRecordArray(response.data);
  }

  async getOrders(limit = 200): Promise<Array<Record<string, unknown>>> {
    const response = await this.http.get<unknown>('/v2/orders', {
      params: { status: 'all', limit, direction: 'desc' },
    });
    return this.asRecordArray(response.data);
  }

  async getOptionsChain(symbol: string): Promise<Array<Record<string, unknown>>> {
    try {
      const response = await this.http.get<unknown>(
        `/v1beta1/options/snapshots/${symbol}`,
      );
      const data = this.asRecord(response.data);
      const snapshotsValue = data.snapshots;
      if (!snapshotsValue || typeof snapshotsValue !== 'object') {
        return [];
      }
      return Object.values(snapshotsValue).map((value) => this.asRecord(value));
    } catch {
      this.logger.warn(
        `Unable to fetch Alpaca options chain for ${symbol}; falling back to local snapshots`,
      );
      return [];
    }
  }

  async placeOrder(payload: AlpacaOrderRequest): Promise<Record<string, unknown>> {
    const response = await this.http.post<unknown>('/v2/orders', payload);
    return this.asRecord(response.data);
  }

  async getOrder(orderId: string): Promise<Record<string, unknown>> {
    const response = await this.http.get<unknown>(`/v2/orders/${orderId}`);
    return this.asRecord(response.data);
  }

  async closePosition(symbol: string): Promise<Record<string, unknown>> {
    const response = await this.http.delete<unknown>(`/v2/positions/${symbol}`);
    return this.asRecord(response.data);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') return {};
    return value as Record<string, unknown>;
  }

  private asRecordArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) return [];
    return value.map((item) => this.asRecord(item));
  }

  private toSafeString(value: unknown, fallback: string): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return fallback;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toNullableInteger(value: unknown): number | null {
    if (value == null) return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  private toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
