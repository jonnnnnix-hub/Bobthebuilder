export function pct(value: number | null | undefined, decimals = 2): string {
  if (value == null) return '—'
  return `${value.toFixed(decimals)}%`
}

export function decimal(value: number | null | undefined, decimals = 4): string {
  if (value == null) return '—'
  return value.toFixed(decimals)
}

export function duration(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const remainder = Math.round(s % 60)
  return `${m}m ${remainder}s`
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function returnColor(value: number | null | undefined): string {
  if (value == null) return ''
  return value >= 0 ? 'text-gain' : 'text-loss'
}
