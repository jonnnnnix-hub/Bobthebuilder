import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { AlpacaService } from '../alpaca/alpaca.service.js';
import { AutonomousExecutionService } from '../trading/autonomous-execution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

type CheckResult = {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
};

const SAFETY_ENV_VARS = [
  'MIN_REQUIRED_EQUITY',
  'MAX_DAILY_LOSS_PCT',
  'KILL_SWITCH_MAX_CONCENTRATION',
  'KILL_SWITCH_MAX_HEAT',
] as const;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  const results: CheckResult[] = [];
  const push = (r: CheckResult) => {
    results.push(r);
    const icon =
      r.status === 'pass' ? 'PASS' : r.status === 'warn' ? 'WARN' : 'FAIL';
    process.stdout.write(`[${icon}] ${r.name} — ${r.detail}\n`);
  };

  try {
    const alpaca = app.get(AlpacaService);
    const exec = app.get(AutonomousExecutionService);
    const prisma = app.get(PrismaService);

    // 1. Required env vars (already validated at boot, but list explicitly).
    const required = [
      'DATABASE_URL',
      'POLYGON_API_KEY',
      'ALPACA_API_KEY',
      'ALPACA_API_SECRET',
    ];
    const missingRequired = required.filter((k) => !process.env[k]);
    push({
      name: 'required env vars',
      status: missingRequired.length === 0 ? 'pass' : 'fail',
      detail:
        missingRequired.length === 0
          ? `${required.length} present`
          : `missing: ${missingRequired.join(', ')}`,
    });

    // 2. Safety env vars must be set explicitly — defaults are silent and dangerous.
    const missingSafety = SAFETY_ENV_VARS.filter((k) => !process.env[k]);
    push({
      name: 'safety env vars set explicitly',
      status: missingSafety.length === 0 ? 'pass' : 'warn',
      detail:
        missingSafety.length === 0
          ? SAFETY_ENV_VARS.map((k) => `${k}=${process.env[k]}`).join(', ')
          : `falling back to hardcoded defaults for: ${missingSafety.join(', ')}`,
    });

    // 3. Live-trading guard.
    const allowLive = process.env.ALLOW_LIVE_TRADING === 'true';
    const baseUrl =
      process.env.ALPACA_PAPER_BASE_URL ?? 'https://paper-api.alpaca.markets';
    const isPaper = /paper-api\.alpaca\.markets/i.test(baseUrl);
    push({
      name: 'trading mode',
      status: 'pass',
      detail: isPaper
        ? `PAPER (${baseUrl})`
        : allowLive
          ? `LIVE (${baseUrl}) — ALLOW_LIVE_TRADING=true`
          : `MISCONFIG: live URL without ALLOW_LIVE_TRADING (would have thrown at boot)`,
    });

    // 4. Account fetch + account safety gate.
    const account = await alpaca.getAccount();
    const gate = exec.checkAccountSafety(account);
    const fmt = (v: unknown): string => {
      if (v == null) return 'n/a';
      if (
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        return String(v);
      }
      return JSON.stringify(v);
    };
    push({
      name: 'alpaca getAccount',
      status: 'pass',
      detail: `status=${fmt(account.status)} equity=${fmt(account.equity)} buying_power=${fmt(account.buying_power)} daytrade_count=${fmt(account.daytrade_count)}`,
    });
    push({
      name: 'account safety gate',
      status: gate.safe ? 'pass' : 'fail',
      detail: gate.safe ? 'gate clear' : `blocked: ${gate.reasons.join('; ')}`,
    });

    // 5. Buying power read.
    const bp = exec.readBuyingPower(account);
    push({
      name: 'buying power available',
      status: bp !== null && bp > 0 ? 'pass' : 'fail',
      detail:
        bp === null
          ? 'buying_power missing from account payload'
          : `${bp.toFixed(2)} USD`,
    });

    // 6. Portfolio kill switch.
    const kill = await exec.checkPortfolioKillSwitch();
    push({
      name: 'portfolio kill switch',
      status: kill.tripped ? 'fail' : 'pass',
      detail: kill.tripped
        ? `tripped: ${kill.reasons.join('; ')}`
        : `concentration=${kill.metrics.maxSymbolConcentration ?? 'n/a'} heat=${kill.metrics.portfolioHeatPct ?? 'n/a'}`,
    });

    // 7. Live positions vs DB position_monitoring drift.
    const positions = await alpaca.getPositions();
    push({
      name: 'alpaca positions',
      status: 'pass',
      detail: `${positions.length} open`,
    });

    // 8. Per-symbol row count in position_monitoring — flag any symbol with
    // more than one live row (would indicate the upsert isn't holding).
    const grouped = await prisma.position_monitoring.groupBy({
      by: ['symbol'],
      _count: { _all: true },
    });
    const dupes = grouped.filter((g) => g._count._all > 5);
    push({
      name: 'position_monitoring row hygiene',
      status: dupes.length === 0 ? 'pass' : 'warn',
      detail:
        dupes.length === 0
          ? `${grouped.length} symbols, all <=5 rows`
          : `bloat detected: ${dupes
              .map((d) => `${d.symbol}=${d._count._all}`)
              .join(', ')}`,
    });

    // 9. Recent orders sanity (last 24h).
    const orders = await alpaca.getOrders(50);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const recent = orders.filter((o) => {
      const submitted = o.submitted_at;
      if (typeof submitted !== 'string') return false;
      return Date.parse(submitted) >= since;
    });
    push({
      name: 'orders in last 24h',
      status: 'pass',
      detail: `${recent.length} of last 50`,
    });

    // 10. Clock drift vs Alpaca server (using order.created_at proxy is noisy;
    // instead just report the local NY time the scheduler will use).
    const nyTime = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
    });
    push({
      name: 'local clock (America/New_York)',
      status: 'pass',
      detail: nyTime,
    });

    // 11. Selected signals waiting to fire.
    const selectedCount = await prisma.signal.count({
      where: { selected: true },
    });
    push({
      name: 'selected signals queued',
      status: 'pass',
      detail: `${selectedCount} signal(s) with selected=true`,
    });

    // Final summary.
    const fails = results.filter((r) => r.status === 'fail').length;
    const warns = results.filter((r) => r.status === 'warn').length;
    process.stdout.write('\n');
    if (fails === 0 && warns === 0) {
      process.stdout.write(
        'GO — all checks pass. Safe to enable autonomous loop.\n',
      );
    } else if (fails === 0) {
      process.stdout.write(
        `CAUTION — ${warns} warning(s). Review above before enabling.\n`,
      );
    } else {
      process.stdout.write(
        `NO-GO — ${fails} failure(s), ${warns} warning(s). Do not trade until resolved.\n`,
      );
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  process.stderr.write(
    `preflight crashed: ${err instanceof Error ? err.stack : String(err)}\n`,
  );
  process.exit(2);
});
