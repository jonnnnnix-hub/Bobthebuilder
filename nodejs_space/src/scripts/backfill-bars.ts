import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { MarketDataService, normalizeDateOnly } from '../market-data/market-data.service.js';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const fromArg = process.argv[2];
    const toArg = process.argv[3];
    if (!fromArg || !toArg) {
      throw new Error('Usage: corepack yarn backfill:bars <from YYYY-MM-DD> <to YYYY-MM-DD>');
    }

    const result = await app.get(MarketDataService).backfillHistoricalBars(
      parseDateArg(fromArg, 'from'),
      parseDateArg(toArg, 'to'),
      'manual',
    );
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
