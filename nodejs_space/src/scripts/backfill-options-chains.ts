import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { OptionsIngestionService } from '../options-ingestion/options-ingestion.service.js';
import { normalizeDateOnly } from '../market-data/market-data.service.js';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const [fromArg, toArg, symbolsArg] = process.argv.slice(2);
    if (!fromArg || !toArg) {
      throw new Error(
        'Usage: corepack yarn backfill:options <from YYYY-MM-DD> <to YYYY-MM-DD> [SYMBOL1,SYMBOL2]',
      );
    }

    const symbols = symbolsArg
      ? symbolsArg
          .split(',')
          .map((symbol) => symbol.trim().toUpperCase())
          .filter(Boolean)
      : undefined;

    const result = await app
      .get(OptionsIngestionService)
      .backfillHistoricalOptions({
        from: parseDateArg(fromArg, 'from'),
        to: parseDateArg(toArg, 'to'),
        symbols,
        tier: 'eod',
      });

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

function parseDateArg(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD format`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }

  return normalizeDateOnly(parsed);
}

void main();
