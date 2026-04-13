import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function Header() {
  const [health, setHealth] = useState<'ok' | 'error' | 'loading'>('loading')

  useEffect(() => {
    api
      .health()
      .then((h) => setHealth(h.database === 'connected' ? 'ok' : 'error'))
      .catch(() => setHealth('error'))
  }, [])

  return (
    <header className="flex h-14 items-center justify-between border-b border-terminal-border bg-terminal-surface px-6">
      <h1 className="text-sm font-semibold text-terminal-text">
        Bob &mdash; Volatility Signal Generator
      </h1>
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            health === 'ok'
              ? 'bg-gain'
              : health === 'error'
                ? 'bg-loss'
                : 'bg-terminal-muted animate-pulse'
          }`}
        />
        <span className="text-terminal-muted">
          {health === 'ok' ? 'Connected' : health === 'error' ? 'Disconnected' : 'Checking...'}
        </span>
      </div>
    </header>
  )
}
