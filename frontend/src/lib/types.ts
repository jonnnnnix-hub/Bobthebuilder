export interface Signal {
  id: number
  symbol: string
  date: string
  atm_iv: number | null
  hv_10: number | null
  hv_20: number | null
  hv_60: number | null
  vrp_20: number | null
  vrp_percentile: number | null
  iv_z: number | null
  iv_z_percentile: number | null
  iv_history_source: string | null
  rank: number | null
  selected: boolean
  selection_reason: string | null
  run_id: string
  created_at: string
}

export interface LatestSignalsResponse {
  run: {
    run_id: string
    date: string
    symbols_analyzed: number
    signals_generated: number
  }
  signals: Signal[]
}

export interface SignalHistoryResponse {
  signals: Signal[]
  pagination: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
}

export interface AnalysisRun {
  id: number
  run_id: string
  started_at: string
  completed_at: string | null
  symbols_analyzed: number
  signals_generated: number
  status: string
  errors: string | null
  duration_ms: number | null
  trigger: string
}

export interface AnalysisStats {
  total_completed_runs: number
  total_signals_generated: number
  latest_run: {
    run_id: string
    date: string
    symbols_analyzed: number
    signals_generated: number
    duration_ms: number
  } | null
  top_selected_symbols: Array<{
    symbol: string
    times_selected: number
  }>
  average_signal_metrics: {
    avg_vrp_20: number
    avg_iv_z: number
    avg_atm_iv: number
  }
}

export interface UniverseSymbol {
  id: number
  symbol: string
  name: string
  sector: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface UniverseResponse {
  total: number
  sectors: Array<{
    sector: string
    count: number
  }>
  symbols: UniverseSymbol[]
}

export interface HealthResponse {
  status: string
  service: string
  version: string
  timestamp: string
  database: string
  last_run: {
    run_id: string
    started_at: string
    signals_generated: number
  } | null
}

export interface BacktestTrade {
  symbol: string
  run_id: string
  signal_date: string
  selected: boolean
  rank: number | null
  selection_reason: string | null
  status: string
  horizon_days: number
  entry_date: string | null
  entry_open: number | null
  exit_date: string | null
  exit_close: number | null
  return_pct: number | null
  latest_available_date: string | null
  latest_available_close: number | null
  mark_to_market_return_pct: number | null
  vrp_20: number | null
  iv_z: number | null
}

export interface BacktestResponse {
  parameters: {
    run_id: string | null
    symbol: string | null
    selected_only: boolean
    from_date: string | null
    to_date: string | null
    horizon_days: number
    trade_limit: number
  }
  summary: {
    total_signals: number
    completed_trades: number
    open_trades: number
    missing_entry_bars: number
    average_return_pct: number
    median_return_pct: number
    win_rate_pct: number
    average_mark_to_market_return_pct: number | null
  }
  leaders: {
    best_completed_trade: BacktestTrade | null
    worst_completed_trade: BacktestTrade | null
  }
  trades: BacktestTrade[]
}
