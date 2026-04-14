#!/bin/sh
set -e

echo "[start] Running Prisma migrations..."
npx prisma migrate deploy

# Seed universe data on first deploy (idempotent — skips if already seeded)
echo "[start] Checking if seed is needed..."
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.symbol.count().then(c => {
  if (c === 0) {
    console.log('[start] No symbols found, running seed...');
    process.exit(1);
  } else {
    console.log('[start] ' + c + ' symbols already seeded, skipping.');
    process.exit(0);
  }
}).catch(() => process.exit(0));
" || npx prisma db seed 2>/dev/null || echo "[start] Seed skipped (no seed script or already done)"

echo "[start] Starting Bob the Builder trading bot..."
node dist/src/main.js
