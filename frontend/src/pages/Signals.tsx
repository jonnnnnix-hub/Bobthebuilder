import { useState, useMemo } from 'react'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import { decimal, pct } from '../lib/format'
import { LoadingSpinner, ErrorState, EmptyState } from '../components/LoadingState'
import type { Signal } from '../lib/types'

type SortField =
  | 'symbol'
  | 'atm_iv'
  | 'hv_10'
  | 'hv_20'
  | 'hv_60'
  | 'vrp_20'
  | 'vrp_percentile'
  | 'iv_z'
  | 'iv_z_percentile'
  | 'rank'

const PAGE_SIZE = 25

export default function Signals() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [sortField, setSortField] = useState<SortField>('rank')
  const [sortAsc, setSortAsc] = useState(true)

  const { data, loading, error } = useApi(() => api.signals.latest(), [])

  const signals = data?.signals ?? []

  const filtered = useMemo(() => {
    let list = signals
    if (selectedOnly) list = list.filter((s) => s.selected)
    if (search) {
      const q = search.toUpperCase()
      list = list.filter((s) => s.symbol.toUpperCase().includes(q))
    }
    return list
  }, [signals, selectedOnly, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortField]
      const bv = b[sortField]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string' && typeof bv === 'string')
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortAsc
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number)
    })
  }, [filtered, sortField, sortAsc])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageData = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(field === 'symbol')
    }
    setPage(1)
  }

  function SortHeader({ field, label }: { field: SortField; label: string }) {
    return (
      <th
        className="cursor-pointer px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted hover:text-terminal-text"
        onClick={() => handleSort(field)}
      >
        {label}
        {sortField === field && (
          <span className="ml-1">{sortAsc ? '\u25B2' : '\u25BC'}</span>
        )}
      </th>
    )
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorState message={error} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Signals</h2>
        <span className="text-xs text-terminal-muted">
          {filtered.length} signals
        </span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search symbol..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="rounded-md border border-terminal-border bg-terminal-bg px-3 py-1.5 text-sm text-terminal-text placeholder:text-terminal-muted focus:border-accent focus:outline-none"
        />
        <label className="flex items-center gap-2 text-sm text-terminal-muted">
          <input
            type="checkbox"
            checked={selectedOnly}
            onChange={(e) => {
              setSelectedOnly(e.target.checked)
              setPage(1)
            }}
            className="rounded border-terminal-border accent-gain"
          />
          Selected only
        </label>
      </div>

      {pageData.length === 0 ? (
        <EmptyState message="No signals match your filters" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-terminal-border">
            <table className="w-full text-sm">
              <thead className="border-b border-terminal-border bg-terminal-surface">
                <tr>
                  <SortHeader field="symbol" label="Symbol" />
                  <SortHeader field="atm_iv" label="ATM IV" />
                  <SortHeader field="hv_10" label="HV 10" />
                  <SortHeader field="hv_20" label="HV 20" />
                  <SortHeader field="hv_60" label="HV 60" />
                  <SortHeader field="vrp_20" label="VRP 20" />
                  <SortHeader field="vrp_percentile" label="VRP %ile" />
                  <SortHeader field="iv_z" label="IV z" />
                  <SortHeader field="iv_z_percentile" label="IV z %ile" />
                  <SortHeader field="rank" label="Rank" />
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                    Sel
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-terminal-muted">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-terminal-border">
                {pageData.map((s: Signal) => (
                  <tr
                    key={s.id}
                    className={`transition-colors hover:bg-terminal-border/30 ${
                      s.selected ? 'bg-gain/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-left font-mono font-medium">
                      <span className={s.selected ? 'text-gain' : ''}>
                        {s.symbol}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {decimal(s.atm_iv)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {decimal(s.hv_10)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {decimal(s.hv_20)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {decimal(s.hv_60)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {decimal(s.vrp_20)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {pct(s.vrp_percentile, 1)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {decimal(s.iv_z, 3)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {pct(s.iv_z_percentile, 1)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {s.rank ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.selected && (
                        <span className="inline-block h-2 w-2 rounded-full bg-gain" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-terminal-muted">
                      {s.iv_history_source ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-terminal-muted">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded border border-terminal-border px-3 py-1 hover:bg-terminal-border disabled:opacity-30"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded border border-terminal-border px-3 py-1 hover:bg-terminal-border disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
