import type { AgentDebateDetail } from '../lib/types'

interface ConsensusCardProps {
  debate: AgentDebateDetail
}

export default function ConsensusCard({ debate }: ConsensusCardProps) {
  const consensus = debate.consensus_result

  if (!consensus) {
    return (
      <div className="rounded border border-terminal-border p-3 text-xs text-terminal-muted">
        No consensus result persisted for this debate.
      </div>
    )
  }

  const decisionColor =
    consensus.final_decision === 'select'
      ? 'text-gain'
      : consensus.final_decision === 'hard_reject'
        ? 'text-loss'
        : 'text-terminal-text'

  return (
    <div className="space-y-2 rounded border border-terminal-border bg-terminal-bg p-3 text-xs">
      <div className="flex items-center justify-between">
        <p className="text-terminal-muted">Decision</p>
        <p className={`font-mono text-sm font-bold ${decisionColor}`}>
          {consensus.final_decision.toUpperCase()}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-terminal-muted">
        <p>
          Strength: <span className="font-mono text-terminal-text">{consensus.consensus_strength}</span>
        </p>
        <p>
          Approval: <span className="font-mono text-terminal-text">{consensus.weighted_approval_pct?.toFixed?.(2) ?? consensus.weighted_approval_pct}%</span>
        </p>
      </div>
      <p>
        Thesis: <span className="text-terminal-text">{consensus.key_thesis ?? '—'}</span>
      </p>
      <p>
        Key Risk: <span className="text-terminal-text">{consensus.key_risk ?? '—'}</span>
      </p>
      {Array.isArray(consensus.dissenting_views) && consensus.dissenting_views.length > 0 && (
        <div>
          <p className="text-terminal-muted">Dissenting Views</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-terminal-text">
            {consensus.dissenting_views.map((view, index) => (
              <li key={`${index}-${view}`}>{String(view)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
