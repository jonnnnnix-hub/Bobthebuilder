import type { AgentDebateDetail } from '../lib/types'

interface AgentVotesProps {
  debate: AgentDebateDetail
}

export default function AgentVotes({ debate }: AgentVotesProps) {
  const round3 = debate.opinions.filter((opinion) => opinion.round_number === 3)

  return (
    <div className="overflow-x-auto rounded border border-terminal-border">
      <table className="w-full text-xs">
        <thead className="border-b border-terminal-border text-terminal-muted">
          <tr>
            <th className="px-2 py-2 text-left">Agent</th>
            <th className="px-2 py-2 text-left">Vote</th>
            <th className="px-2 py-2 text-right">Confidence</th>
            <th className="px-2 py-2 text-left">Conviction</th>
          </tr>
        </thead>
        <tbody>
          {round3.map((opinion) => (
            <tr key={opinion.id} className="border-b border-terminal-border/40">
              <td className="px-2 py-2">{opinion.agent_name}</td>
              <td className="px-2 py-2 font-mono uppercase">{opinion.vote}</td>
              <td className="px-2 py-2 text-right font-mono">{opinion.confidence_score ?? '—'}</td>
              <td className="px-2 py-2">{opinion.conviction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
