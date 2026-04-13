# Bob Frontend — Volatility Signal Generator Dashboard

React 19 + TypeScript + Vite + Tailwind CSS + Recharts frontend for the Bob options volatility signal generator.

## Pages

- **Dashboard** (`/`) — Latest run status, top 5 selected signals, run history chart
- **Signals** (`/signals`) — Sortable, filterable table of all signals from the latest run
- **Backtest** (`/backtest`) — Backtest summary, best/worst trade highlights, trades table
- **Universe** (`/universe`) — Symbol universe with sector filtering and search
- **Runs** (`/runs`) — Analysis run history with status badges

## Development

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` with API requests proxied to `http://localhost:3000`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` | Backend API base URL |

## Build

```bash
npm run build
npm run preview   # preview production build
```

## Docker

```bash
docker build -t bob-frontend .
docker run -p 80:80 bob-frontend
```

The nginx config proxies `/api/` requests to `http://backend:3000`. Adjust the upstream in `nginx.conf` or use Docker Compose networking.

## Tech Stack

- React 19 with TypeScript
- Vite 8
- Tailwind CSS 4
- Recharts 3
- React Router 7
