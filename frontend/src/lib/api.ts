import type {
  HealthResponse,
  LatestSignalsResponse,
  SignalHistoryResponse,
  AnalysisRun,
  AnalysisStats,
  UniverseResponse,
  BacktestResponse,
} from './types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => fetchJson<HealthResponse>('/api/health'),

  signals: {
    latest: (selectedOnly = false) =>
      fetchJson<LatestSignalsResponse>(
        `/api/signals/latest${selectedOnly ? '?selected_only=true' : ''}`,
      ),
    history: (params?: {
      symbol?: string
      selected_only?: boolean
      page?: number
      limit?: number
    }) => {
      const sp = new URLSearchParams()
      if (params?.symbol) sp.set('symbol', params.symbol)
      if (params?.selected_only) sp.set('selected_only', 'true')
      if (params?.page) sp.set('page', String(params.page))
      if (params?.limit) sp.set('limit', String(params.limit))
      const qs = sp.toString()
      return fetchJson<SignalHistoryResponse>(
        `/api/signals/history${qs ? `?${qs}` : ''}`,
      )
    },
  },

  analysis: {
    runs: (params?: { limit?: number; status?: string }) => {
      const sp = new URLSearchParams()
      if (params?.limit) sp.set('limit', String(params.limit))
      if (params?.status) sp.set('status', params.status)
      const qs = sp.toString()
      return fetchJson<AnalysisRun[]>(
        `/api/analysis/runs${qs ? `?${qs}` : ''}`,
      )
    },
    stats: () => fetchJson<AnalysisStats>('/api/analysis/stats'),
  },

  universe: (params?: { active_only?: boolean; sector?: string }) => {
    const sp = new URLSearchParams()
    if (params?.active_only) sp.set('active_only', 'true')
    if (params?.sector) sp.set('sector', params.sector)
    const qs = sp.toString()
    return fetchJson<UniverseResponse>(
      `/api/universe${qs ? `?${qs}` : ''}`,
    )
  },

  backtest: (params?: {
    selected_only?: boolean
    horizon_days?: number
    limit?: number
  }) => {
    const sp = new URLSearchParams()
    if (params?.selected_only) sp.set('selected_only', 'true')
    if (params?.horizon_days)
      sp.set('horizon_days', String(params.horizon_days))
    if (params?.limit) sp.set('limit', String(params.limit))
    const qs = sp.toString()
    return fetchJson<BacktestResponse>(
      `/api/research/backtest${qs ? `?${qs}` : ''}`,
    )
  },

  config: () =>
    fetchJson<Record<string, { value: string; description: string }>>(
      '/api/config',
    ),
}
