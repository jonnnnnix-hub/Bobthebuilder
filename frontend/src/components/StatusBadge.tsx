interface StatusBadgeProps {
  status: string
}

const styles: Record<string, string> = {
  completed: 'bg-gain/15 text-gain',
  running: 'bg-accent/15 text-accent',
  failed: 'bg-loss/15 text-loss',
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        styles[status] ?? 'bg-terminal-border text-terminal-muted'
      }`}
    >
      {status}
    </span>
  )
}
