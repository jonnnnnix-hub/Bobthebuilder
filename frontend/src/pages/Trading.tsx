import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from 'recharts'
import Card from '../components/Card'
import { ErrorState, LoadingSpinner } from '../components/LoadingState'
import { api } from '../lib/api'
import type {
  TradingHistoryItem,
  TradingLog,
  TradingPortfolio,
  TradingPosition,
  TradingRisk,
} from '../lib/types'
import { dateTime, pct, returnColor } from '../lib/format'

function dollars(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function Trading() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [portfolio, setPortfolio] = useState<TradingPortfolio | null>(null)
  const [positions, setPositions] = useState<TradingPosition[]>([])
  const [history, setHistory] = useState<TradingHistoryItem[]>([])
  const [risk, setRisk] = useState<TradingRisk | null>(null)
  const [logs, setLogs] = useState<TradingLog[]>([])
  const [exitingId, setExitingId] = useState<string | null>(null)

  async function load() {
    try {
      const [portfolioData, positionsData, historyData, riskData, logsData] =
        await Promise.all([
          api.trading.portfolio(),
          api.trading.positions(),
          api.trading.history(150),
          api.trading.risk(),
          api.trading.logs(200),
        ])

      setPortfolio(portfolioData)
      setPositions(positionsData)
      setHistory(historyData)
      setRisk(riskData)
      setLogs(logsData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 8000)
    return () => window.clearInterval(timer)
  }, [])

  const strategyBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    positions.forEach((position) => {
      const key = position.strategy ?? 'unknown'
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return [...map.entries()].map(([strategy, count]) => ({ strategy, count }))
  }, [positions])

  const winLossDistribution = useMemo(() => {
    const wins = history.filter((item) => item.side === 'sell').length
    const losses = Math.max(0, history.length - wins)
    return [
      { name: 'Wins', value: wins },
      { name: 'Losses', value: losses },
    ]
  }, [history])

  async function manualExit(positionId: string) {
    setExitingId(positionId)
    try {
      await api.trading.manualExit(positionId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExitingId(null)
    }
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorState message={error} />

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Trading Portal</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <Card title="Total P&L">
          <p className={`font-mono text-2xl font-bold ${returnColor(portfolio?.total_pnl)}`}>
            {dollars(portfolio?.total_pnl)}
          </p>
          <p className="mt-2 text-xs text-terminal-muted">
            Day {dollars(portfolio?.daily_pnl)} / Week {dollars(portfolio?.weekly_pnl)}
          </p>
        </Card>
        <Card title="Account Balance">
          <p className="font-mono text-xl font-bold">{dollars(portfolio?.account_balance)}</p>
          <p className="mt-2 text-xs text-terminal-muted">
            Buying Power {dollars(portfolio?.buying_power)}
          </p>
        </Card>
        <Card title="Portfolio Greeks">
          <div className="space-y-1 font-mono text-xs">
            <p>Δ {portfolio ? portfolio.greeks.delta.toFixed(2) : '—'}</p>
            <p>Γ {portfolio ? portfolio.greeks.gamma.toFixed(2) : '—'}</p>
            <p>Θ {portfolio ? portfolio.greeks.theta.toFixed(2) : '—'}</p>
            <p>V {portfolio ? portfolio.greeks.vega.toFixed(2) : '—'}</p>
          </div>
        </Card>
        <Card title="Quality Metrics">
          <p className="font-mono text-xl font-bold">{pct((portfolio?.win_rate ?? 0) * 100, 1)}</p>
          <p className="mt-2 text-xs text-terminal-muted">
            Sharpe {portfolio?.sharpe_ratio.toFixed(2) ?? '—'}
          </p>
        </Card>
        <Card title="Active Positions">
          <p className="font-mono text-2xl font-bold text-accent">{portfolio?.active_positions ?? 0}</p>
        </Card>
      </div>

      <Card title="Open Positions">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-terminal-border text-terminal-muted">
                <th className="px-2 py-2 text-left">Symbol</th>
                <th className="px-2 py-2 text-left">Strategy</th>
                <th className="px-2 py-2 text-right">Entry</th>
                <th className="px-2 py-2 text-right">Current</th>
                <th className="px-2 py-2 text-right">Unrealized P&L</th>
                <th className="px-2 py-2 text-right">Greeks</th>
                <th className="px-2 py-2 text-right">DTE</th>
                <th className="px-2 py-2 text-right">Exit Status</th>
                <th className="px-2 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => (
                <tr key={position.id} className="border-b border-terminal-border/40">
                  <td className="px-2 py-2 font-mono text-gain">{position.symbol}</td>
                  <td className="px-2 py-2">{position.strategy ?? '—'}</td>
                  <td className="px-2 py-2 text-right font-mono">{dollars(position.avg_entry_price)}</td>
                  <td className="px-2 py-2 text-right font-mono">{dollars(position.current_price)}</td>
                  <td className={`px-2 py-2 text-right font-mono ${returnColor(position.unrealized_pl)}`}>
                    {dollars(position.unrealized_pl)} ({pct(position.unrealized_pl_pct * 100, 2)})
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    Δ{position.greeks.delta.toFixed(2)} / Γ{position.greeks.gamma.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{position.dte_remaining ?? '—'}</td>
                  <td className="px-2 py-2 text-right">{JSON.stringify(position.exit_criteria_status ?? {})}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => manualExit(position.id)}
                      disabled={exitingId === position.id}
                      className="rounded border border-loss px-2 py-1 text-loss hover:bg-loss/10 disabled:opacity-30"
                    >
                      {exitingId === position.id ? 'Exiting…' : 'Manual Exit'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Trade History">
          <div className="max-h-80 overflow-y-auto text-xs">
            {history.map((item) => (
              <div key={item.id} className="grid grid-cols-6 gap-2 border-b border-terminal-border/40 py-2">
                <span className="font-mono">{item.symbol}</span>
                <span>{item.side}</span>
                <span className="text-right">{item.status}</span>
                <span className="text-right font-mono">{item.quantity}</span>
                <span className="text-right font-mono">{dollars(item.filled_avg_price)}</span>
                <span className="text-right text-terminal-muted">{dateTime(item.filled_at ?? item.submitted_at)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Portfolio Analytics">
          <div className="space-y-4">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={portfolio?.charts.equity_curve ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="index" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#22c55e" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={portfolio?.charts.drawdown_curve ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="index" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#ef4444" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={strategyBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="strategy" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={winLossDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Risk Dashboard">
          {risk ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <p>VaR 95: <span className="font-mono">{dollars(risk.var_95)}</span></p>
              <p>Drawdown: <span className="font-mono">{pct(risk.max_drawdown_pct * 100, 2)}</span></p>
              <p>Heat: <span className="font-mono">{pct(risk.portfolio_heat_pct * 100, 2)}</span></p>
              <p>Liquidity: <span className="font-mono">{risk.liquidity_score.toFixed(3)}</span></p>
              <p>Max Symbol: <span className="font-mono">{pct(risk.max_symbol_concentration * 100, 2)}</span></p>
              <p>Regime: <span className="font-mono">{risk.market_regime ?? '—'}</span></p>
              <p>Delta: <span className="font-mono">{risk.portfolio_delta.toFixed(2)}</span></p>
              <p>Gamma: <span className="font-mono">{risk.portfolio_gamma.toFixed(2)}</span></p>
              <p>Theta: <span className="font-mono">{risk.portfolio_theta.toFixed(2)}</span></p>
              <p>Vega: <span className="font-mono">{risk.portfolio_vega.toFixed(2)}</span></p>
            </div>
          ) : (
            <p className="text-xs text-terminal-muted">No risk metrics yet</p>
          )}
        </Card>

        <Card title="Execution Logs">
          <div className="max-h-72 space-y-2 overflow-y-auto text-xs">
            {logs.map((log) => (
              <div key={log.id} className="rounded border border-terminal-border px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-terminal-muted">{log.event_type}</span>
                  <span className="text-terminal-muted">{dateTime(log.created_at)}</span>
                </div>
                <p className="mt-1">{log.message}</p>
                <p className="mt-1 font-mono text-terminal-muted">
                  {log.symbol ? `${log.symbol} · ` : ''}{log.level.toUpperCase()}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
