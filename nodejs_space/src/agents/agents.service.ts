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
    const rollingWindow = 20;

    const [totalDebates, byDecision, agentVoteRows, recentConsensus, recentRound3Votes] =
      await Promise.all([
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
        this.prisma.consensus_result.findMany({
          orderBy: { created_at: 'desc' },
          take: rollingWindow,
          select: {
            debate_id: true,
            symbol: true,
            final_decision: true,
            weighted_approval_pct: true,
            confidence_adjusted_score: true,
            risk_vetoed: true,
            created_at: true,
          },
        }),
        this.prisma.agent_vote.findMany({
          where: {
            debate_id: { not: null },
            round_number: 3,
          },
          orderBy: { created_at: 'desc' },
          take: rollingWindow * 10,
          select: {
            debate_id: true,
            agent_name: true,
            vote: true,
            confidence_score: true,
            created_at: true,
          },
        }),
      ]);

    const decisionBreakdown = byDecision.reduce<Record<string, number>>((acc, row) => {
      acc[row.final_decision] = row._count;
      return acc;
    }, {});

    const agentVoteBreakdown = agentVoteRows.reduce<Record<string, Record<string, number>>>(
      (acc, row) => {
        if (!acc[row.agent_name]) {
          acc[row.agent_name] = {};
        }
        acc[row.agent_name][row.vote] = row._count;
        return acc;
      },
      {},
    );

    const recentDebateIds = new Set(recentConsensus.map((row) => row.debate_id.toString()));
    const finalDecisionByDebate = new Map(
      recentConsensus.map((row) => [row.debate_id.toString(), row.final_decision]),
    );

    const rollingByAgent = new Map<
      string,
      {
        total: number;
        correct: number;
        selectVotes: number;
        sumConfidence: number;
      }
    >();

    for (const vote of recentRound3Votes) {
      const debateId = vote.debate_id?.toString();
      if (!debateId || !recentDebateIds.has(debateId)) {
        continue;
      }

      const finalDecision = finalDecisionByDebate.get(debateId);
      if (!finalDecision) {
        continue;
      }

      const expectedSelect = finalDecision === 'select';
      const votedSelect = vote.vote === 'select';
      const isCorrect = votedSelect === expectedSelect;

      const bucket = rollingByAgent.get(vote.agent_name) ?? {
        total: 0,
        correct: 0,
        selectVotes: 0,
        sumConfidence: 0,
      };
      bucket.total += 1;
      bucket.correct += isCorrect ? 1 : 0;
      bucket.selectVotes += votedSelect ? 1 : 0;
      bucket.sumConfidence += vote.confidence_score ? Number(vote.confidence_score) : 0;
      rollingByAgent.set(vote.agent_name, bucket);
    }

    const perAgentRollingAccuracy = [...rollingByAgent.entries()]
      .map(([agentName, stats]) => {
        const accuracyPct = stats.total === 0 ? 0 : (stats.correct / stats.total) * 100;
        const selectRatePct = stats.total === 0 ? 0 : (stats.selectVotes / stats.total) * 100;
        const avgConfidence = stats.total === 0 ? 0 : stats.sumConfidence / stats.total;

        return {
          agent_name: agentName,
          sample_size: stats.total,
          correct_votes: stats.correct,
          accuracy_pct: Number(accuracyPct.toFixed(2)),
          select_rate_pct: Number(selectRatePct.toFixed(2)),
          avg_confidence: Number(avgConfidence.toFixed(4)),
        };
      })
      .sort((a, b) => b.accuracy_pct - a.accuracy_pct || b.sample_size - a.sample_size);

    const recommendationQualityTrend = [...recentConsensus]
      .reverse()
      .map((row, index) => {
        const weightedApproval = row.weighted_approval_pct
          ? Number(row.weighted_approval_pct)
          : 0;
        const confidenceAdjusted = row.confidence_adjusted_score
          ? Number(row.confidence_adjusted_score)
          : 0;

        return {
          index: index + 1,
          debate_id: row.debate_id.toString(),
          symbol: row.symbol,
          decision: row.final_decision,
          weighted_approval_pct: Number(weightedApproval.toFixed(2)),
          confidence_adjusted_score: Number(confidenceAdjusted.toFixed(2)),
          risk_vetoed: row.risk_vetoed,
          created_at: row.created_at,
        };
      });

    return {
      total_debates: totalDebates,
      decision_breakdown: decisionBreakdown,
      agent_vote_breakdown: agentVoteBreakdown,
      rolling_window: rollingWindow,
      per_agent_rolling_accuracy: perAgentRollingAccuracy,
      recommendation_quality_trend: recommendationQualityTrend,
    };
  }
}