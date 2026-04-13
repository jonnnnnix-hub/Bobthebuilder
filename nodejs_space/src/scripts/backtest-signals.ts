import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { ResearchService } from '../research/research.service.js';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const fromArg = process.argv[2];
    const toArg = process.argv[3];
    const horizonArg = process.argv[4];

    const result = await app.get(ResearchService).backtestSignals({
      selectedOnly: true,
      fromDate: fromArg ? parseDateArg(fromArg, 'from') : undefined,
      toDate: toArg ? parseDateArg(toArg, 'to') : undefined,
      horizonDays: horizonArg ? parsePositiveInteger(horizonArg, 'horizon_days') : 5,
      limit: 100,
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

  return parsed;
}

function parsePositiveInteger(value: string, label: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a positive integer`);
  }

  const parsed = Number.parseInt(value, 10);
  if (parsed <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }

  return parsed;
}

void main();
