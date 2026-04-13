import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { decimal, dateTime } from '../lib/format'
import Card from '../components/Card'
import { LoadingSpinner, ErrorState, EmptyState } from '../components/LoadingState'
import StatusBadge from '../components/StatusBadge'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

export default function Dashboard() {
  const latest = useApi(() => api.signals.latest(), [])
  const stats = useApi(() => api.analysis.stats(), [])
  const runs = useApi(() => api.analysis.runs({ limit: 30 }), [])

  if (latest.loading || stats.loading) return <LoadingSpinner />
  if (latest.error) return <ErrorState message={latest.error} />

  const selectedSignals = latest.data?.signals.filter((s) => s.selected) ?? []
  const run = latest.data?.run

  const chartData =
    runs.data
      ?.filter((r) => r.status === 'completed')
      .slice()
      .reverse()
      .map((r) => ({
        date: new Date(r.started_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        signals: r.signals_generated,
        analyzed: r.symbols_analyzed,
        duration_s: r.duration_ms ? +(r.duration_ms / 1000).toFixed(1) : 0,
      })) ?? []

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Dashboard</h2>

      {/* Latest run status */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card title="Latest Run">
          {run ? (
            <div className="space-y-2">
              <p className="font-mono text-xs text-terminal-muted">{run.run_id}</p>
              <p className="text-sm">{dateTime(run.date)}</p>
              <StatusBadge status="completed" />
            </div>
          ) : (
            <p className="text-sm text-terminal-muted">No runs yet</p>
          )}
        </Card>
        <Card title="Symbols Analyzed">
          <p className="font-mono text-2xl font-bold text-terminal-text">
            {run?.symbols_analyzed ?? 0}
          </p>
        </Card>
        <Card title="Signals Generated">
          <p className="font-mono text-2xl font-bold text-accent">
            {run?.signals_generated ?? 0}
          </p>
        </Card>
        <Card title="Total Runs">
          <p className="font-mono text-2xl font-bold text-terminal-text">
            {stats.data?.total_completed_runs ?? 0}
          </p>
        </Card>
      </div>

      {/* Top 5 selected signals */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-terminal-muted">
          Top Selected Signals
        </h3>
        {selectedSignals.length === 0 ? (
          <EmptyState message="No selected signals in the latest run" />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            {selectedSignals.slice(0, 5).map((s) => (
              <Card key={s.id}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-base font-bold text-gain">
                      {s.symbol}
                    </span>
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-xs text-accent">
                      #{s.rank}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-terminal-muted">VRP_20</span>
                      <span className="font-mono">{decimal(s.vrp_20)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-terminal-muted">IV_z</span>
                      <span className="font-mono">{decimal(s.iv_z, 3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-terminal-muted">ATM_IV</span>
                      <span className="font-mono">{decimal(s.atm_iv)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Run history chart */}
      {chartData.length > 0 && (
        <Card title="Run History">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis
                  dataKey="date"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#12121a',
                    border: '1px solid #1e1e2e',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Line
                  type="monotone"
                  dataKey="signals"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  name="Signals"
                />
                <Line
                  type="monotone"
                  dataKey="duration_s"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Duration (s)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Top selected symbols over time */}
      {stats.data?.top_selected_symbols && stats.data.top_selected_symbols.length > 0 && (
        <Card title="Most Selected Symbols">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {stats.data.top_selected_symbols.slice(0, 10).map((s) => (
              <div
                key={s.symbol}
                className="flex items-center justify-between rounded border border-terminal-border px-3 py-2"
              >
                <span className="font-mono text-sm font-medium">{s.symbol}</span>
                <span className="font-mono text-xs text-terminal-muted">
                  {s.times_selected}x
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Avg metrics */}
      {stats.data?.average_signal_metrics && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Avg VRP_20">
            <p className="font-mono text-xl font-bold">
              {decimal(stats.data.average_signal_metrics.avg_vrp_20)}
            </p>
          </Card>
          <Card title="Avg IV_z">
            <p className="font-mono text-xl font-bold">
              {decimal(stats.data.average_signal_metrics.avg_iv_z, 3)}
            </p>
          </Card>
          <Card title="Avg ATM_IV">
            <p className="font-mono text-xl font-bold">
              {decimal(stats.data.average_signal_metrics.avg_atm_iv)}
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}
