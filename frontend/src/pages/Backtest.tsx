import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { pct, decimal, dateShort, returnColor } from '../lib/format'
import Card from '../components/Card'
import { LoadingSpinner, ErrorState, EmptyState } from '../components/LoadingState'
import type { BacktestTrade } from '../lib/types'

export default function Backtest() {
  const { data, loading, error } = useApi(
    () => api.backtest({ selected_only: true, limit: 200 }),
    [],
  )

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorState message={error} />
  if (!data) return <EmptyState message="No backtest data available" />

  const { summary, leaders, trades } = data
  const best = leaders.best_completed_trade
  const worst = leaders.worst_completed_trade

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Backtest Results</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card title="Total Signals">
          <p className="font-mono text-2xl font-bold">{summary.total_signals}</p>
        </Card>
        <Card title="Completed Trades">
          <p className="font-mono text-2xl font-bold">{summary.completed_trades}</p>
        </Card>
        <Card title="Win Rate">
          <p className={`font-mono text-2xl font-bold ${summary.win_rate_pct >= 50 ? 'text-gain' : 'text-loss'}`}>
            {pct(summary.win_rate_pct, 1)}
          </p>
        </Card>
        <Card title="Avg Return">
          <p className={`font-mono text-2xl font-bold ${returnColor(summary.average_return_pct)}`}>
            {pct(summary.average_return_pct)}
          </p>
        </Card>
        <Card title="Median Return">
          <p className={`font-mono text-2xl font-bold ${returnColor(summary.median_return_pct)}`}>
            {pct(summary.median_return_pct)}
          </p>
        </Card>
      </div>

      {/* Best / Worst trades */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {best && (
          <Card title="Best Trade" className="border-gain/20">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-lg font-bold text-gain">{best.symbol}</span>
                <span className="font-mono text-lg font-bold text-gain">
                  {pct(best.return_pct)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-terminal-muted">Signal Date</span>
                  <span className="font-mono">{dateShort(best.signal_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-muted">Entry</span>
                  <span className="font-mono">${best.entry_open?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-muted">Exit</span>
                  <span className="font-mono">${best.exit_close?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-muted">VRP_20</span>
                  <span className="font-mono">{decimal(best.vrp_20)}</span>
                </div>
              </div>
            </div>
          </Card>
        )}
        {worst && (
          <Card title="Worst Trade" className="border-loss/20">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-lg font-bold text-loss">{worst.symbol}</span>
                <span className="font-mono text-lg font-bold text-loss">
                  {pct(worst.return_pct)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-terminal-muted">Signal Date</span>
                  <span className="font-mono">{dateShort(worst.signal_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-muted">Entry</span>
                  <span className="font-mono">${worst.entry_open?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-muted">Exit</span>
                  <span className="font-mono">${worst.exit_close?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-muted">VRP_20</span>
                  <span className="font-mono">{decimal(worst.vrp_20)}</span>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Trades table */}
      {trades.length === 0 ? (
        <EmptyState message="No trades to display" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-terminal-border">
          <table className="w-full text-sm">
            <thead className="border-b border-terminal-border bg-terminal-surface">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-terminal-muted">
                  Symbol
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                  Signal Date
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                  Entry
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                  Exit
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                  Return
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                  Status
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                  Rank
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                  VRP_20
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                  IV_z
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border">
              {trades.map((t: BacktestTrade, i: number) => (
                <tr key={`${t.symbol}-${t.run_id}-${i}`} className="hover:bg-terminal-border/30">
                  <td className="px-3 py-2 font-mono font-medium">{t.symbol}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {dateShort(t.signal_date)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {t.entry_open != null ? `$${t.entry_open.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {t.exit_close != null ? `$${t.exit_close.toFixed(2)}` : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-medium ${returnColor(t.return_pct)}`}>
                    {t.return_pct != null ? pct(t.return_pct) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-terminal-muted">
                    {t.status}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{t.rank ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{decimal(t.vrp_20)}</td>
                  <td className="px-3 py-2 text-right font-mono">{decimal(t.iv_z, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
