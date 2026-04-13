import { useState, useMemo } from 'react'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { LoadingSpinner, ErrorState, EmptyState } from '../components/LoadingState'
import type { UniverseSymbol } from '../lib/types'

export default function Universe() {
  const [search, setSearch] = useState('')
  const [sectorFilter, setSectorFilter] = useState('')

  const { data, loading, error } = useApi(() => api.universe(), [])

  const symbols = data?.symbols ?? []
  const sectors = data?.sectors ?? []

  const filtered = useMemo(() => {
    let list = symbols
    if (sectorFilter) list = list.filter((s) => s.sector === sectorFilter)
    if (search) {
      const q = search.toUpperCase()
      list = list.filter(
        (s) =>
          s.symbol.toUpperCase().includes(q) ||
          s.name.toUpperCase().includes(q),
      )
    }
    return list
  }, [symbols, sectorFilter, search])

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorState message={error} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Universe</h2>
        <span className="text-xs text-terminal-muted">
          {data?.total ?? 0} symbols ({filtered.length} shown)
        </span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search symbol or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-terminal-border bg-terminal-bg px-3 py-1.5 text-sm text-terminal-text placeholder:text-terminal-muted focus:border-accent focus:outline-none"
        />
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="rounded-md border border-terminal-border bg-terminal-bg px-3 py-1.5 text-sm text-terminal-text focus:border-accent focus:outline-none"
        >
          <option value="">All Sectors</option>
          {sectors.map((s) => (
            <option key={s.sector} value={s.sector}>
              {s.sector} ({s.count})
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No symbols match your filters" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-terminal-border">
          <table className="w-full text-sm">
            <thead className="border-b border-terminal-border bg-terminal-surface">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-terminal-muted">
                  Symbol
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-terminal-muted">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-terminal-muted">
                  Sector
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-terminal-muted">
                  Active
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border">
              {filtered.map((s: UniverseSymbol) => (
                <tr key={s.id} className="hover:bg-terminal-border/30">
                  <td className="px-3 py-2 font-mono font-medium">{s.symbol}</td>
                  <td className="px-3 py-2 text-terminal-muted">{s.name}</td>
                  <td className="px-3 py-2">
                    {s.sector ? (
                      <span className="rounded bg-terminal-border px-2 py-0.5 text-xs">
                        {s.sector}
                      </span>
                    ) : (
                      <span className="text-xs text-terminal-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.active ? (
                      <span className="inline-block h-2 w-2 rounded-full bg-gain" />
                    ) : (
                      <span className="inline-block h-2 w-2 rounded-full bg-terminal-muted" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
