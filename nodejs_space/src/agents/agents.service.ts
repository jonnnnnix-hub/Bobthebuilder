import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DebateOrchestratorService } from './debate-orchestrator.service.js';

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: DebateOrchestratorService,
  ) {}

  async initiateDebate(signalId: number) {
    return this.orchestrator.runDebateForSignal(signalId);
  }

  async listDebates(limit = 50) {
    const rows = await this.prisma.agent_debate.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
      include: {
        consensus_result: true,
      },
    });

    return rows.map((row) => ({
      id: row.id.toString(),
      run_id: row.run_id,
      signal_id: row.signal_id,
      symbol: row.symbol,
      status: row.status,
      consensus: row.consensus,
      consensus_strength: row.consensus_strength,
      weighted_approval_pct: row.weighted_approval_pct,
      risk_vetoed: row.risk_vetoed,
      started_at: row.started_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
      final_decision: row.consensus_result?.final_decision ?? null,
      key_thesis: row.consensus_result?.key_thesis ?? null,
      key_risk: row.consensus_result?.key_risk ?? null,
    }));
  }

  async getDebate(debateId: bigint) {
    const debate = await this.prisma.agent_debate.findUnique({
      where: { id: debateId },
      include: {
        opinions: {
          orderBy: [{ round_number: 'asc' }, { created_at: 'asc' }],
        },
        transcripts: {
          orderBy: { round_number: 'asc' },
        },
        votes: {
          orderBy: [{ round_number: 'asc' }, { created_at: 'asc' }],
        },
        consensus_result: true,
      },
    });

    if (!debate) {
      return null;
    }

    return {
      id: debate.id.toString(),
      run_id: debate.run_id,
      signal_id: debate.signal_id,
      symbol: debate.symbol,
      status: debate.status,
      consensus: debate.consensus,
      consensus_strength: debate.consensus_strength,
      weighted_approval_pct: debate.weighted_approval_pct,
      risk_vetoed: debate.risk_vetoed,
      error_message: debate.error_message,
      started_at: debate.started_at,
      completed_at: debate.completed_at,
      created_at: debate.created_at,
      opinions: debate.opinions.map((opinion) => ({
        id: opinion.id.toString(),
        round_number: opinion.round_number,
        agent_name: opinion.agent_name,
        category_score: opinion.category_score,
        conviction: opinion.conviction,
        thesis: opinion.thesis,
        key_risk: opinion.key_risk,
        vote: opinion.vote,
        confidence_score: opinion.confidence_score,
        challenge_payload: opinion.challenge_payload,
        response_payload: opinion.response_payload,
        prompt_version: opinion.prompt_version,
      })),
      transcripts: debate.transcripts.map((row) => ({
        round_number: row.round_number,
        transcript: row.transcript,
      })),
      votes: debate.votes.map((vote) => ({
        id: vote.id.toString(),
        round_number: vote.round_number,
        agent_name: vote.agent_name,
        vote: vote.vote,
        confidence_score: vote.confidence_score,
      })),
      consensus_result: debate.consensus_result
        ? {
            id: debate.consensus_result.id.toString(),
            final_decision: debate.consensus_result.final_decision,
            consensus_strength: debate.consensus_result.consensus_strength,
            weighted_approval_pct: debate.consensus_result.weighted_approval_pct,
            confidence_adjusted_score:
              debate.consensus_result.confidence_adjusted_score,
            risk_vetoed: debate.consensus_result.risk_vetoed,
            votes: debate.consensus_result.votes,
            key_thesis: debate.consensus_result.key_thesis,
            key_risk: debate.consensus_result.key_risk,
            dissenting_views: debate.consensus_result.dissenting_views,
          }
        : null,
    };
  }

  async getStats() {
    const [totalDebates, byDecision, agentAccuracyRows] = await Promise.all([
      this.prisma.agent_debate.count(),
      this.prisma.consensus_result.groupBy({
        by: ['final_decision'],
        _count: true,
      }),
      this.prisma.agent_vote.groupBy({
        by: ['agent_name', 'vote'],
        _count: true,
        where: { debate_id: { not: null }, round_number: 3 },
      }),
    ]);

    const decisionBreakdown = byDecision.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.final_decision] = row._count;
        return acc;
      },
      {},
    );

    const agentVoteBreakdown = agentAccuracyRows.reduce<
      Record<string, Record<string, number>>
    >((acc, row) => {
      if (!acc[row.agent_name]) {
        acc[row.agent_name] = {};
      }
      acc[row.agent_name][row.vote] = row._count;
      return acc;
    }, {});

    return {
      total_debates: totalDebates,
      decision_breakdown: decisionBreakdown,
      agent_vote_breakdown: agentVoteBreakdown,
    };
  }
}
