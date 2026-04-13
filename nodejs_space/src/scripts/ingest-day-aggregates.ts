import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import {
  MarketDataService,
  defaultIngestionDate,
  normalizeDateOnly,
} from '../market-data/market-data.service.js';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const dateArg = process.argv[2];
    const targetDate = dateArg ? parseDateArg(dateArg) : defaultIngestionDate();
    const result = await app.get(MarketDataService).ingestDayAggregates(targetDate, 'manual');
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

function parseDateArg(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date must use YYYY-MM-DD format');
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Date must be valid');
  }

  return normalizeDateOnly(parsed);
}

void main();
