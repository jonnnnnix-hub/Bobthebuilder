import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { DataFreshnessTier } from '../options-data/types.js';
import { OptionsDataService } from '../options-data/options-data.service.js';
import { normalizeDateOnly } from '../market-data/market-data.service.js';

const OPTIONS_DATASET = 'options/chain_snapshot';
const STORE_BATCH_SIZE = 400;

@Injectable()
export class OptionsIngestionService {
  private readonly logger = new Logger(OptionsIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly optionsDataService: OptionsDataService,
  ) {}

  async ingestSnapshotForSymbol(params: {
    symbol: string;
    asOf: Date;
    trigger?: string;
    tier?: DataFreshnessTier;
  }) {
    const tier = params.tier ?? 'intraday';
    const trigger = params.trigger ?? 'manual';

    const run = await this.prisma.ingestion_run.create({
      data: {
        provider: 'options_dual_source',
        dataset: OPTIONS_DATASET,
        target_date: normalizeDateOnly(params.asOf),
        trigger,
        status: 'running',
      },
    });

    const startedAt = Date.now();

    try {
      const mergedSnapshot = await this.optionsDataService.fetchMergedSnapshot({
        symbol: params.symbol,
        asOf: params.asOf,
        tier,
      });

      const rows: Prisma.option_chain_snapshotCreateManyInput[] =
        mergedSnapshot.mergedQuotes.map((quote) => ({
          snapshot_date: mergedSnapshot.snapshotDate,
          snapshot_ts: mergedSnapshot.snapshotTs,
          underlying_symbol: mergedSnapshot.underlyingSymbol,
          option_symbol: quote.optionSymbol,
          expiration: quote.expiration,
          strike: quote.strike,
          option_type: quote.optionType,
          bid: quote.bid,
          ask: quote.ask,
          mid: quote.mid,
          last: quote.last,
          mark: quote.mark,
          volume: quote.volume,
          open_interest: quote.openInterest,
          implied_volatility: quote.impliedVolatility,
          delta: quote.delta,
          gamma: quote.gamma,
          theta: quote.theta,
          vega: quote.vega,
          rho: quote.rho,
          source_primary: mergedSnapshot.primarySource,
          source_secondary: mergedSnapshot.secondarySource,
          freshness_tier: mergedSnapshot.freshnessTier,
          quality_status: this.resolveQualityStatus(quote.qualityFlags),
          quality_flags: quote.qualityFlags,
          raw_payload: {
            source: quote.source,
            warnings: quote.qualityFlags,
          },
        }));

      await this.storeSnapshots(rows);

      const durationMs = Date.now() - startedAt;
      await this.prisma.ingestion_run.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          rows_considered: rows.length,
          rows_ingested: rows.length,
          rows_skipped: mergedSnapshot.qualitySummary.invalid,
          duration_ms: durationMs,
          completed_at: new Date(),
          errors: JSON.stringify({
            sources_used: mergedSnapshot.sourcesUsed,
            quality_summary: mergedSnapshot.qualitySummary,
          }),
        },
      });

      return {
        run_id: run.id,
        symbol: params.symbol.toUpperCase(),
        snapshot_date: mergedSnapshot.snapshotDate.toISOString().slice(0, 10),
        rows_ingested: rows.length,
        quality_summary: mergedSnapshot.qualitySummary,
        sources_used: mergedSnapshot.sourcesUsed,
        duration_ms: durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      await this.prisma.ingestion_run.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          duration_ms: durationMs,
          completed_at: new Date(),
          errors: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  async backfillHistoricalOptions(params: {
    from: Date;
    to: Date;
    symbols?: string[];
    tier?: DataFreshnessTier;
  }) {
    const from = normalizeDateOnly(params.from);
    const to = normalizeDateOnly(params.to);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from must be on or before to');
    }

    const symbols =
      params.symbols && params.symbols.length > 0
        ? params.symbols.map((symbol) => symbol.toUpperCase())
        : (
            await this.prisma.universe.findMany({
              where: { active: true },
              select: { symbol: true },
            })
          ).map((row) => row.symbol);

    let totalRuns = 0;
    const failures: Array<{ symbol: string; date: string; error: string }> = [];

    for (const date of this.iterateDates(from, to)) {
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
        continue;
      }

      for (const symbol of symbols) {
        try {
          await this.ingestSnapshotForSymbol({
            symbol,
            asOf: date,
            trigger: 'backfill',
            tier: params.tier ?? 'eod',
          });
          totalRuns += 1;
        } catch (error) {
          failures.push({
            symbol,
            date: date.toISOString().slice(0, 10),
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    this.logger.log(
      `Historical options backfill complete. runs=${totalRuns}, failures=${failures.length}`,
    );

    return {
      total_runs: totalRuns,
      failures,
    };
  }

  private async storeSnapshots(
    rows: Prisma.option_chain_snapshotCreateManyInput[],
  ): Promise<void> {
    for (let index = 0; index < rows.length; index += STORE_BATCH_SIZE) {
      const batch = rows.slice(index, index + STORE_BATCH_SIZE);
      await this.prisma.option_chain_snapshot.createMany({
        data: batch,
        skipDuplicates: true,
      });
    }
  }

  private iterateDates(from: Date, to: Date): Date[] {
    const dates: Date[] = [];
    const cursor = new Date(from);
    while (cursor.getTime() <= to.getTime()) {
      dates.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  private resolveQualityStatus(
    flags: string[],
  ): 'valid' | 'valid_with_warnings' | 'invalid' {
    if (
      flags.some(
        (flag) => flag.startsWith('invalid_') || flag === 'expired_contract',
      )
    ) {
      return 'invalid';
    }
    return flags.length > 0 ? 'valid_with_warnings' : 'valid';
  }
}
