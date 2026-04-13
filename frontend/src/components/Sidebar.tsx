import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Dashboard', icon: '⊞' },
  { to: '/signals', label: 'Signals', icon: '⚡' },
  { to: '/backtest', label: 'Backtest', icon: '⟳' },
  { to: '/universe', label: 'Universe', icon: '◉' },
  { to: '/runs', label: 'Runs', icon: '▶' },
]

export default function Sidebar() {
  return (
    <aside className="flex w-56 flex-col border-r border-terminal-border bg-terminal-surface">
      <div className="flex h-14 items-center gap-2 border-b border-terminal-border px-5">
        <span className="font-mono text-lg font-bold text-gain">B</span>
        <span className="text-sm font-semibold text-terminal-text">Bob</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {links.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-accent-dim text-accent'
                  : 'text-terminal-muted hover:bg-terminal-border/50 hover:text-terminal-text'
              }`
            }
          >
            <span className="w-5 text-center font-mono text-xs">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-terminal-border p-4 text-xs text-terminal-muted">
        Phase 1 &middot; v1.0.0
      </div>
    </aside>
  )
}
