import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { dateTime, duration } from '../lib/format'
import StatusBadge from '../components/StatusBadge'
import { LoadingSpinner, ErrorState, EmptyState } from '../components/LoadingState'
import type { AnalysisRun } from '../lib/types'

export default function Runs() {
  const { data, loading, error } = useApi(
    () => api.analysis.runs({ limit: 50 }),
    [],
  )

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorState message={error} />
  if (!data || data.length === 0) return <EmptyState message="No analysis runs yet" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Analysis Runs</h2>
        <span className="text-xs text-terminal-muted">{data.length} runs</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-terminal-border">
        <table className="w-full text-sm">
          <thead className="border-b border-terminal-border bg-terminal-surface">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-terminal-muted">
                Run ID
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-terminal-muted">
                Status
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                Started
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                Duration
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                Analyzed
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                Signals
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                Trigger
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-terminal-border">
            {data.map((r: AnalysisRun) => (
              <tr key={r.run_id} className="hover:bg-terminal-border/30">
                <td className="px-3 py-2 font-mono text-xs">{r.run_id}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {dateTime(r.started_at)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {duration(r.duration_ms)}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {r.symbols_analyzed}
                </td>
                <td className="px-3 py-2 text-right font-mono">{r.signals_generated}</td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      r.trigger === 'cron'
                        ? 'bg-accent/15 text-accent'
                        : 'bg-terminal-border text-terminal-muted'
                    }`}
                  >
                    {r.trigger}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
