import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { DailyBar, PolygonService } from '../polygon/polygon.service.js';
import axios, { AxiosError } from 'axios';
import * as crypto from 'crypto';
import { gunzipSync } from 'zlib';

type ParsedDayAggregateRow = {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: bigint;
  transactions: bigint | null;
};

type ListBarsParams = {
  symbol: string;
  from?: Date;
  to?: Date;
  limit: number;
};

type CoverageParams = {
  from: Date;
  to: Date;
};

type IngestedBarRow = ParsedDayAggregateRow & {
  date: Date;
};

type CoverageRow = {
  symbol: string;
  bar_count: number;
  first_date: string | null;
  last_date: string | null;
  sources: string[];
};

const POLYGON_FLAT_FILE_BUCKET = 'flatfiles';
const POLYGON_DAY_AGGREGATES_DATASET = 'us_stocks_sip/day_aggs_v1';
const POLYGON_REST_DAY_AGGREGATES_DATASET = 'rest/day_aggs';
const MIN_LOCAL_BAR_COUNT = 61;
const BACKFILL_BATCH_SIZE = 5;
const BACKFILL_DELAY_MS = 350;
const STORE_BATCH_SIZE = 200;

export function buildPolygonDayAggregateObjectKey(targetDate: Date): string {
  const normalized = normalizeDateOnly(targetDate);
  const year = normalized.getUTCFullYear();
  const month = `${normalized.getUTCMonth() + 1}`.padStart(2, '0');
  const day = formatDateOnly(normalized);
  return `${POLYGON_DAY_AGGREGATES_DATASET}/${year}/${month}/${day}/${day}.csv.gz`;
}

export function normalizeDateOnly(value: Date): Date {
  const normalized = new Date(value);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

export function defaultIngestionDate(referenceDate: Date = new Date()): Date {
  const candidate = normalizeDateOnly(referenceDate);
  candidate.setUTCDate(candidate.getUTCDate() - 1);

  while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) {
    candidate.setUTCDate(candidate.getUTCDate() - 1);
  }

  return candidate;
}

export function parsePolygonDayAggregatesCsv(
  csvText: string,
): ParsedDayAggregateRow[] {
  const trimmed = csvText.trim();
  if (!trimmed) {
    return [];
  }

  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0]
    .split(',')
    .map((header) => header.trim().toLowerCase());
  const headerIndex = new Map<string, number>(
    headers.map((header, index) => [header, index]),
  );

  const requiredHeaders = ['ticker', 'open', 'high', 'low', 'close', 'volume'];
  for (const header of requiredHeaders) {
    if (!headerIndex.has(header)) {
      throw new BadRequestException(
        `Flat file is missing required column: ${header}`,
      );
    }
  }

  const transactionsIndex =
    headerIndex.get('transactions') ??
    headerIndex.get('transaction_count') ??
    headerIndex.get('number_of_transactions');

  const rows: ParsedDayAggregateRow[] = [];
  for (const line of lines.slice(1)) {
    const columns = line.split(',');
    const symbol = columns[headerIndex.get('ticker') ?? -1]?.trim();
    if (!symbol) {
      continue;
    }

    const open = parseFiniteNumber(columns[headerIndex.get('open') ?? -1]);
    const high = parseFiniteNumber(columns[headerIndex.get('high') ?? -1]);
    const low = parseFiniteNumber(columns[headerIndex.get('low') ?? -1]);
    const close = parseFiniteNumber(columns[headerIndex.get('close') ?? -1]);
    const volume = parseBigIntValue(columns[headerIndex.get('volume') ?? -1]);
    const transactions =
      transactionsIndex !== undefined
        ? parseOptionalBigIntValue(columns[transactionsIndex])
        : null;

    if (
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      volume === null
    ) {
      continue;
    }

    rows.push({
      symbol,
      open,
      high,
      low,
      close,
      volume,
      transactions,
    });
  }

  return rows;
}

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly flatFilesEndpoint: string;
  private readonly flatFilesAccessKey: string;
  private readonly flatFilesSecretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly polygon: PolygonService,
    private readonly configService: ConfigService,
  ) {
    this.flatFilesEndpoint =
      this.configService.get<string>('POLYGON_FLAT_FILES_ENDPOINT')?.trim() ||
      'https://files.massive.com';
    this.flatFilesAccessKey =
      this.configService.get<string>('POLYGON_FLAT_FILES_KEY')?.trim() ||
      this.configService.get<string>('POLYGON_S3_ACCESS_KEY')?.trim() ||
      '';
    this.flatFilesSecretKey =
      this.configService.get<string>('POLYGON_FLAT_FILES_SECRET')?.trim() ||
      this.configService.get<string>('POLYGON_S3_SECRET_KEY')?.trim() ||
      '';
  }

  isFlatFilesConfigured(): boolean {
    return (
      this.flatFilesAccessKey.length > 0 && this.flatFilesSecretKey.length > 0
    );
  }

  async getHistoricalBars(symbol: string, days: number): Promise<DailyBar[]> {
    const localBars = await this.prisma.market_bar.findMany({
      where: { symbol },
      orderBy: { date: 'desc' },
      take: days + 1,
    });

    if (localBars.length >= Math.min(days + 1, MIN_LOCAL_BAR_COUNT)) {
      return localBars.reverse().map((bar) => ({
        o: bar.open,
        h: bar.high,
        l: bar.low,
        c: bar.close,
        v: Number(bar.volume),
        t: bar.date.getTime(),
      }));
    }

    return this.polygon.getHistoricalBars(symbol, days);
  }

  async listBars(params: ListBarsParams) {
    const where: {
      symbol: string;
      date?: {
        gte?: Date;
        lte?: Date;
      };
    } = { symbol: params.symbol };

    if (params.from || params.to) {
      where.date = {};
      if (params.from) {
        where.date.gte = normalizeDateOnly(params.from);
      }
      if (params.to) {
        where.date.lte = normalizeDateOnly(params.to);
      }
    }

    return this.prisma.market_bar.findMany({
      where,
      orderBy: { date: 'desc' },
      take: params.limit,
    });
  }

  async listIngestionRuns(limit: number) {
    return this.prisma.ingestion_run.findMany({
      orderBy: { started_at: 'desc' },
      take: limit,
    });
  }

  async getCoverage(params: CoverageParams) {
    const from = normalizeDateOnly(params.from);
    const to = normalizeDateOnly(params.to);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from must be on or before to');
    }

    const [activeSymbols, bars] = await Promise.all([
      this.prisma.universe.findMany({
        where: { active: true },
        select: { symbol: true },
        orderBy: { symbol: 'asc' },
      }),
      this.prisma.market_bar.findMany({
        where: {
          date: {
            gte: from,
            lte: to,
          },
        },
        select: {
          symbol: true,
          date: true,
          source: true,
        },
        orderBy: [{ symbol: 'asc' }, { date: 'asc' }],
      }),
    ]);

    const coverageBySymbol = new Map<string, CoverageRow>();
    for (const symbol of activeSymbols.map((row) => row.symbol)) {
      coverageBySymbol.set(symbol, {
        symbol,
        bar_count: 0,
        first_date: null,
        last_date: null,
        sources: [],
      });
    }

    const sourceCounts: Record<string, number> = {};
    for (const bar of bars) {
      const current = coverageBySymbol.get(bar.symbol) ?? {
        symbol: bar.symbol,
        bar_count: 0,
        first_date: null,
        last_date: null,
        sources: [],
      };
      current.bar_count += 1;
      current.first_date ??= formatDateOnly(bar.date);
      current.last_date = formatDateOnly(bar.date);
      if (!current.sources.includes(bar.source)) {
        current.sources.push(bar.source);
      }
      coverageBySymbol.set(bar.symbol, current);
      sourceCounts[bar.source] = (sourceCounts[bar.source] ?? 0) + 1;
    }

    const symbolCoverage = [...coverageBySymbol.values()];
    const missingSymbols = symbolCoverage
      .filter((row) => row.bar_count === 0)
      .map((row) => row.symbol);

    return {
      date_range: {
        from: formatDateOnly(from),
        to: formatDateOnly(to),
      },
      summary: {
        active_symbols: activeSymbols.length,
        symbols_with_data: symbolCoverage.filter((row) => row.bar_count > 0)
          .length,
        missing_symbols: missingSymbols.length,
        total_bars: bars.length,
        source_counts: sourceCounts,
      },
      missing_symbols: missingSymbols,
      symbols: symbolCoverage,
    };
  }

  async backfillHistoricalBars(
    fromDate: Date,
    toDate: Date,
    trigger: string = 'manual',
  ) {
    if (!this.polygon.isConfigured()) {
      throw new Error('POLYGON_API_KEY is not configured');
    }

    const from = normalizeDateOnly(fromDate);
    const to = normalizeDateOnly(toDate);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from must be on or before to');
    }
    if (to.getTime() > normalizeDateOnly(new Date()).getTime()) {
      throw new BadRequestException('to cannot be in the future');
    }

    const run = await this.prisma.ingestion_run.create({
      data: {
        provider: 'polygon',
        dataset: POLYGON_REST_DAY_AGGREGATES_DATASET,
        target_date: to,
        trigger,
        status: 'running',
      },
    });
    const startedAt = Date.now();

    try {
      const symbols = await this.prisma.universe.findMany({
        where: { active: true },
        select: { symbol: true },
        orderBy: { symbol: 'asc' },
      });

      let totalRowsConsidered = 0;
      let totalRowsStored = 0;
      const symbolsWithData: string[] = [];
      const symbolsWithoutData: string[] = [];

      for (
        let index = 0;
        index < symbols.length;
        index += BACKFILL_BATCH_SIZE
      ) {
        const batch = symbols.slice(index, index + BACKFILL_BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async ({ symbol }) => {
            const bars = await this.polygon.getHistoricalBarsRange(
              symbol,
              from,
              to,
            );
            return { symbol, bars };
          }),
        );

        for (const { symbol, bars } of batchResults) {
          totalRowsConsidered += bars.length;
          if (bars.length === 0) {
            symbolsWithoutData.push(symbol);
            continue;
          }

          const rows = bars.map((bar) =>
            this.mapDailyBarToStoredRow(symbol, bar, 'polygon_rest_api'),
          );
          await this.storeBars(rows);
          totalRowsStored += rows.length;
          symbolsWithData.push(symbol);
        }

        if (index + BACKFILL_BATCH_SIZE < symbols.length) {
          await this.delay(BACKFILL_DELAY_MS);
        }
      }

      const durationMs = Date.now() - startedAt;
      const completionNotes =
        symbolsWithoutData.length > 0
          ? JSON.stringify({
              symbols_without_data: symbolsWithoutData.slice(0, 25),
              symbols_without_data_count: symbolsWithoutData.length,
            })
          : null;

      await this.prisma.ingestion_run.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          rows_considered: totalRowsConsidered,
          rows_ingested: totalRowsStored,
          rows_skipped: symbolsWithoutData.length,
          duration_ms: durationMs,
          completed_at: new Date(),
          errors: completionNotes,
        },
      });

      return {
        run_id: run.id,
        provider: 'polygon',
        dataset: POLYGON_REST_DAY_AGGREGATES_DATASET,
        from: formatDateOnly(from),
        to: formatDateOnly(to),
        symbols_considered: symbols.length,
        symbols_with_data: symbolsWithData.length,
        symbols_without_data: symbolsWithoutData.length,
        rows_considered: totalRowsConsidered,
        rows_ingested: totalRowsStored,
        duration_ms: durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = getErrorMessage(error);
      await this.prisma.ingestion_run.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          duration_ms: durationMs,
          completed_at: new Date(),
          errors: message,
        },
      });

      throw error;
    }
  }

  async ingestDayAggregates(targetDate?: Date, trigger: string = 'manual') {
    if (!this.isFlatFilesConfigured()) {
      throw new Error('Polygon flat-file credentials are not configured');
    }

    const normalizedTargetDate = normalizeDateOnly(
      targetDate ?? defaultIngestionDate(),
    );
    if (
      normalizedTargetDate.getTime() > normalizeDateOnly(new Date()).getTime()
    ) {
      throw new BadRequestException('target date cannot be in the future');
    }

    const run = await this.prisma.ingestion_run.create({
      data: {
        provider: 'polygon',
        dataset: POLYGON_DAY_AGGREGATES_DATASET,
        target_date: normalizedTargetDate,
        trigger,
        status: 'running',
      },
    });
    const startedAt = Date.now();

    try {
      const [buffer, activeSymbols] = await Promise.all([
        this.downloadDayAggregatesFile(normalizedTargetDate),
        this.prisma.universe.findMany({
          where: { active: true },
          select: { symbol: true },
        }),
      ]);

      const universeSymbols = new Set(
        activeSymbols.map((entry) => entry.symbol),
      );
      const parsedRows = parsePolygonDayAggregatesCsv(
        gunzipSync(buffer).toString('utf8'),
      );

      let rowsSkipped = 0;
      const rowsToStore: IngestedBarRow[] = [];
      for (const row of parsedRows) {
        if (!universeSymbols.has(row.symbol)) {
          rowsSkipped++;
          continue;
        }

        rowsToStore.push({
          ...row,
          date: normalizedTargetDate,
        });
      }

      await this.storeBars(
        rowsToStore.map((row) => ({ ...row, source: 'polygon_flat_file' })),
      );

      const durationMs = Date.now() - startedAt;
      await this.prisma.ingestion_run.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          rows_considered: parsedRows.length,
          rows_ingested: rowsToStore.length,
          rows_skipped: rowsSkipped,
          duration_ms: durationMs,
          completed_at: new Date(),
        },
      });

      this.logger.log(
        `Imported ${rowsToStore.length} market bars for ${formatDateOnly(normalizedTargetDate)} from Polygon flat files`,
      );

      return {
        run_id: run.id,
        provider: 'polygon',
        dataset: POLYGON_DAY_AGGREGATES_DATASET,
        target_date: formatDateOnly(normalizedTargetDate),
        rows_considered: parsedRows.length,
        rows_ingested: rowsToStore.length,
        rows_skipped: rowsSkipped,
        duration_ms: durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = getErrorMessage(error);
      await this.prisma.ingestion_run.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          rows_considered: 0,
          rows_ingested: 0,
          rows_skipped: 0,
          duration_ms: durationMs,
          completed_at: new Date(),
          errors: message,
        },
      });

      throw error;
    }
  }

  private async storeBars(
    rows: Array<IngestedBarRow & { source: string }>,
  ): Promise<void> {
    for (let index = 0; index < rows.length; index += STORE_BATCH_SIZE) {
      const batch = rows.slice(index, index + STORE_BATCH_SIZE);
      await this.prisma.$transaction(
        batch.map((row) =>
          this.prisma.market_bar.upsert({
            where: {
              symbol_date: {
                symbol: row.symbol,
                date: row.date,
              },
            },
            update: {
              open: row.open,
              high: row.high,
              low: row.low,
              close: row.close,
              volume: row.volume,
              transactions: row.transactions,
              source: row.source,
            },
            create: {
              symbol: row.symbol,
              date: row.date,
              open: row.open,
              high: row.high,
              low: row.low,
              close: row.close,
              volume: row.volume,
              transactions: row.transactions,
              source: row.source,
            },
          }),
        ),
      );
    }
  }

  private mapDailyBarToStoredRow(
    symbol: string,
    bar: DailyBar,
    source: string,
  ): IngestedBarRow & { source: string } {
    return {
      symbol,
      date: normalizeDateOnly(new Date(bar.t)),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: BigInt(Math.trunc(bar.v)),
      transactions: null,
      source,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async downloadDayAggregatesFile(targetDate: Date): Promise<Buffer> {
    const objectKey = buildPolygonDayAggregateObjectKey(targetDate);
    return this.downloadObject(objectKey);
  }

  private async downloadObject(objectKey: string): Promise<Buffer> {
    const now = new Date();
    const canonicalUri = `/${POLYGON_FLAT_FILE_BUCKET}/${splitAndEncodePath(objectKey)}`;
    const payloadHash = sha256Hex('');
    const requestHeaders = this.buildSignedHeaders({
      canonicalUri,
      host: new URL(this.flatFilesEndpoint).host,
      now,
      payloadHash,
    });

    try {
      const response = await axios.get<ArrayBuffer>(
        `${this.flatFilesEndpoint}${canonicalUri}`,
        {
          headers: requestHeaders,
          responseType: 'arraybuffer',
          timeout: 60000,
        },
      );

      return Buffer.from(response.data);
    } catch (error) {
      throw this.mapFlatFileError(error, objectKey);
    }
  }

  private buildSignedHeaders(params: {
    canonicalUri: string;
    host: string;
    now: Date;
    payloadHash: string;
  }): Record<string, string> {
    const amzDate = formatAmzDate(params.now);
    const dateStamp = amzDate.slice(0, 8);
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalHeaders = [
      `host:${params.host}`,
      `x-amz-content-sha256:${params.payloadHash}`,
      `x-amz-date:${amzDate}`,
    ].join('\n');
    const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`;
    const canonicalRequest = [
      'GET',
      params.canonicalUri,
      '',
      `${canonicalHeaders}\n`,
      signedHeaders,
      params.payloadHash,
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');
    const signingKey = getSignatureKey(
      this.flatFilesSecretKey,
      dateStamp,
      'us-east-1',
      's3',
    );
    const signature = hmacHex(signingKey, stringToSign);

    return {
      'x-amz-date': amzDate,
      'x-amz-content-sha256': params.payloadHash,
      Authorization: [
        `AWS4-HMAC-SHA256 Credential=${this.flatFilesAccessKey}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
      ].join(', '),
    };
  }

  private mapFlatFileError(error: unknown, objectKey: string): Error {
    if (!axios.isAxiosError(error)) {
      return new Error(getErrorMessage(error));
    }

    const bodyText = readAxiosBody(error);
    if (error.response?.status === 403) {
      return new Error(
        `Flat-file access was forbidden for ${objectKey}. Verify that POLYGON_FLAT_FILES_KEY and POLYGON_FLAT_FILES_SECRET are the dashboard-issued S3 credentials and that your Massive/Polygon plan includes this dataset.${bodyText ? ` Response: ${bodyText}` : ''}`,
      );
    }
    if (error.response?.status === 404) {
      return new Error(
        `Flat-file object not found for ${objectKey}. The requested trading day may be unavailable yet, outside your history window, or the dataset path may differ for this plan.`,
      );
    }

    return new Error(
      `Flat-file download failed for ${objectKey}: ${error.message}${bodyText ? ` Response: ${bodyText}` : ''}`,
    );
  }
}

function parseFiniteNumber(value: string | undefined): number | null {
  if (value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBigIntValue(value: string | undefined): bigint | null {
  if (!value) {
    return null;
  }

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parseOptionalBigIntValue(value: string | undefined): bigint | null {
  if (!value) {
    return null;
  }

  return parseBigIntValue(value);
}

function splitAndEncodePath(objectKey: string): string {
  return objectKey
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/');
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest();
}

function hmacHex(key: Buffer | string, value: string): string {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  regionName: string,
  serviceName: string,
): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, 'aws4_request');
}

function formatAmzDate(value: Date): string {
  return value.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

function readAxiosBody(error: AxiosError): string | null {
  const payload = error.response?.data;
  if (!payload) {
    return null;
  }

  if (typeof payload === 'string') {
    return payload;
  }
  if (Buffer.isBuffer(payload)) {
    return payload.toString('utf8');
  }
  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString('utf8');
  }

  return null;
}
