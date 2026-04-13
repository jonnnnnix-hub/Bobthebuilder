import type { AgentDebateDetail } from '../lib/types'

interface DebateTranscriptProps {
  debate: AgentDebateDetail
}

export default function DebateTranscript({ debate }: DebateTranscriptProps) {
  const grouped = [1, 2, 3].map((round) => ({
    round,
    messages: debate.opinions.filter((opinion) => opinion.round_number === round),
  }))

  return (
    <div className="space-y-3">
      {grouped.map(({ round, messages }) => (
        <div key={round} className="rounded border border-terminal-border p-3">
          <p className="mb-2 text-xs font-semibold text-terminal-muted">Round {round}</p>
          <div className="space-y-2 text-xs">
            {messages.map((message) => (
              <div key={message.id} className="rounded border border-terminal-border/60 p-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-terminal-text">{message.agent_name}</p>
                  <p className="font-mono text-terminal-muted uppercase">{message.vote}</p>
                </div>
                <p className="mt-1 text-terminal-text">{message.thesis}</p>
                <p className="mt-1 text-terminal-muted">Risk: {message.key_risk ?? '—'}</p>
              </div>
            ))}
            {messages.length === 0 && (
              <p className="text-terminal-muted">No messages for this round.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
