# Bob Options Volatility Backend

NestJS + Prisma backend for Phase 1 of the Bob volatility signal generator. The service computes and serves options-volatility analysis metadata, signal history, configuration, and run status. It does not execute trades.

Backtesting rule: never use simulated, proxy, or fake volatility data. Historical analytics and any future backtests must use only real observed market data persisted in the system.

## Stack

- NestJS 11
- TypeScript
- Prisma ORM
- PostgreSQL
- Polygon.io market data
- ORATS historical implied-volatility data
- Swagger at `/api-docs`

## Required environment variables

Create `.env` with:

```bash
DATABASE_URL=postgresql://...
ORATS_API_KEY=your-orats-token
ORATS_SYMBOL_OVERRIDES=BRK.B=BRK-B|BRKB
POLYGON_API_KEY=your-polygon-key
POLYGON_FLAT_FILES_KEY=your-flat-files-access-key
POLYGON_FLAT_FILES_SECRET=your-flat-files-secret
POLYGON_FLAT_FILES_ENDPOINT=https://files.massive.com
CRON_API_KEY=your-cron-secret
PORT=3000
HOST=127.0.0.1
```

`HOST` defaults to `127.0.0.1` for local development.

## Local setup

If `node` is not already on your shell `PATH`, prepend the local toolchain first:

```bash
export PATH="/Users/jonathan.lemor/.local/node/bin:$PATH"
```

Install dependencies:

```bash
corepack yarn install
```

Generate the Prisma client:

```bash
corepack yarn db:generate
```

Apply the checked-in migration:

```bash
corepack yarn db:deploy
```

Seed the baseline universe and configuration:

```bash
corepack yarn db:seed
```

## Temporary local database setup

The current local workflow uses a staged copy of `Postgres.app` under `/tmp/Postgres.app` and a cluster under `/tmp/bob-pgdata` on port `5433`.

Start PostgreSQL:

```bash
PATH='/tmp/Postgres.app/Contents/Versions/16/bin':$PATH pg_ctl -D /tmp/bob-pgdata -l /tmp/bob-postgres.log -o "-p 5433 -k /tmp" start
```

Stop PostgreSQL:

```bash
PATH='/tmp/Postgres.app/Contents/Versions/16/bin':$PATH pg_ctl -D /tmp/bob-pgdata stop
```

## Run the service

```bash
corepack yarn start
```

Development watch mode:

```bash
corepack yarn start:dev
```

Production build:

```bash
corepack yarn build
corepack yarn start:prod
```

If the database is temporarily unreachable, the app will still boot so Swagger and health diagnostics remain available. Database-backed endpoints still require a working PostgreSQL connection.

## Signal correctness

- ATM IV uses only matched call/put pairs at the same real strike and expiration.
- Polygon option-chain retrieval first targets 15-50 DTE expirations around the underlying price, then falls back to a broader expiration-filtered fetch when needed.
- ORATS `iv30d` summary data is the primary real-data basis for `iv_z`.
- ORATS requests normalize dotted tickers such as `BRK.B` before querying the upstream API.
- `ORATS_SYMBOL_OVERRIDES` can provide explicit alias candidates when a vendor symbol does not match your universe symbol directly.
- Stored database `atm_iv` history is fallback only when ORATS history is unavailable.
- If there is not enough real IV history, `iv_z` stays `null` rather than being estimated from a proxy.
- Each stored signal now includes `vrp_percentile`, `iv_z_percentile`, and a `selection_reason` so missed selections can be diagnosed after the run.
- Each stored signal also records `iv_history_source` so diagnostics can distinguish `orats`, `database_fallback`, and `missing` IV-history paths.
- Current tuned defaults are `vrp_threshold_percentile=94` and `iv_z_threshold_percentile=91.5`, based on live nearest-miss diagnostics from April 12, 2026.
- Historical daily OHLCV ingestion now uses the Massive/Polygon S3-compatible flat-file endpoint and persists real `market_bar` rows locally.
- Live analysis prefers locally ingested `market_bar` history when at least 61 real daily bars are available for a symbol, then falls back to Polygon REST bars when local history is still too shallow.

## Historical ingestion

Ingest one trading day of real stock day-aggregate bars into the local database:

```bash
corepack yarn ingest:day 2026-04-10
```

If no date is provided, the command defaults to the previous weekday.

Backfill a real historical range from Polygon REST into `market_bar`:

```bash
corepack yarn backfill:bars 2025-10-01 2026-04-10
```

Run the research backtest over persisted selected signals:

```bash
corepack yarn research:backtest 2026-04-01 2026-04-12 5
```

This workflow uses only stored `signal` rows plus stored `market_bar` rows. Entry is the next trading day's open after the signal date, and exit is the close on the configured holding-horizon day.

The backend now exposes:

- `GET /api/market/bars?symbol=AAPL&limit=50`
- `GET /api/market/ingestion/runs?limit=20`
- `GET /api/market/coverage?from=2025-10-01&to=2026-04-10`
- `GET /api/research/backtest?selected_only=true&horizon_days=5`

If flat-file access fails with `403 NOT_AUTHORIZED`, verify that `POLYGON_FLAT_FILES_KEY` and `POLYGON_FLAT_FILES_SECRET` are the dedicated S3 credentials from your Massive/Polygon dashboard, not just the standard REST API key.
Until flat-file entitlement is confirmed, `backfill:bars` provides a real-data fallback using Polygon's REST aggregates API.

## Research workflow

- `GET /api/research/backtest` evaluates persisted signals against persisted daily bars only.
- The backtest never synthesizes prices or fills in missing bars.
- Trade statuses are explicit:
  - `completed`: entry and exit bars exist
  - `open_no_exit`: entry exists, but not enough forward bars exist yet
  - `missing_entry_bar`: no trading-day bar exists after the signal date yet
- Because current live selected signals are dated April 12, 2026 and the latest local market bars are April 10, 2026, those signals currently show `missing_entry_bar` until newer bars are ingested.

## Verification

Build the app:

```bash
corepack yarn build
```

Run the integration test suite:

```bash
corepack yarn test:e2e --runInBand
```

Run the calculation unit tests:

```bash
corepack yarn test --runInBand
```

## API surface

- `GET /api/health`
- `GET /api/universe`
- `GET /api/config`
- `GET /api/signals/latest`
- `GET /api/signals/history`
- `GET /api/analysis/runs`
- `GET /api/analysis/stats`
- `GET /api/market/bars`
- `GET /api/market/ingestion/runs`
- `GET /api/market/coverage`
- `GET /api/research/backtest`
- `POST /api/analysis/trigger`

## Database workflow

The initial Prisma migration lives under [`prisma/migrations`](./prisma/migrations). Useful commands:

```bash
corepack yarn db:generate
corepack yarn db:migrate
corepack yarn db:deploy
corepack yarn db:seed
```

## Permanent follow-ups

- Replace the `/tmp`-based Postgres.app staging with a durable local PostgreSQL install or containerized service.
- Move local database startup into a repeatable script or dev compose workflow.
- Split `.env` defaults by environment so local and remote database URLs are managed intentionally.
- Add full HTTP-level e2e coverage in an environment that permits local port binding.
