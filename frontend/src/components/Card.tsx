import type { ReactNode } from 'react'

interface CardProps {
  title?: string
  children: ReactNode
  className?: string
}

export default function Card({ title, children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-terminal-border bg-terminal-surface p-5 transition-colors hover:border-terminal-muted/40 ${className}`}
    >
      {title && (
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-terminal-muted">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}
