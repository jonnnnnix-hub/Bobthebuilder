import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AgentRoundOpinion,
  ConsensusResult,
  DebateRunResult,
  DebateSignalInput,
} from './interfaces.js';
import { SpecialistAgentsFactory } from './specialist-agents.js';

@Injectable()
export class DebateOrchestratorService {
  private readonly logger = new Logger(DebateOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsFactory: SpecialistAgentsFactory,
  ) {}

  async runDebateForSignal(signalId: number, runId?: string): Promise<DebateRunResult> {
    const signal = await this.prisma.signal.findUnique({
      where: { id: signalId },
      select: {
        id: true,
        run_id: true,
        symbol: true,
        date: true,
        composite_score: true,
        composite_score_normalized: true,
        score_confidence: true,
        category_scores: true,
      },
    });

    if (!signal) {
      throw new Error(`Signal ${signalId} not found`);
    }

    const debateRunId = runId ?? `debate_${signal.run_id}_${signal.symbol}_${Date.now()}`;
    const debate = await this.prisma.agent_debate.create({
      data: {
        run_id: debateRunId,
        signal_id: signal.id,
        symbol: signal.symbol,
        status: 'running',
        started_at: new Date(),
      },
    });

    try {
      const input = await this.buildInput(signal.id, signal.run_id, signal.symbol, signal.date, {
        composite_score: signal.composite_score,
        composite_score_normalized: signal.composite_score_normalized,
        score_confidence: signal.score_confidence,
        category_scores: signal.category_scores,
      });

      const agents = this.agentsFactory.createAgents();

      const round1 = await Promise.all(agents.map((agent) => agent.analyzeRound1(input)));
      await this.persistRound(debate.id, input, debateRunId, 1, round1);

      const round2: AgentRoundOpinion[] = [];
      for (const agent of agents) {
        round2.push(await agent.analyzeRound2(input, round1));
      }
      await this.persistRound(debate.id, input, debateRunId, 2, round2);

      const round3: AgentRoundOpinion[] = [];
      for (const agent of agents) {
        round3.push(await agent.analyzeRound3(input, round2));
      }
      await this.persistRound(debate.id, input, debateRunId, 3, round3);

      const consensus = this.calculateConsensus(input, round3);
      await this.persistConsensus(debate.id, input, consensus);

      await this.prisma.agent_debate.update({
        where: { id: debate.id },
        data: {
          status: 'completed',
          completed_at: new Date(),
          consensus: consensus.consensus,
          consensus_strength: consensus.consensusStrength,
          weighted_approval_pct: consensus.weightedApprovalPct,
          risk_vetoed: consensus.riskVetoed,
        },
      });

      return {
        debateId: debate.id,
        signalId: input.signalId,
        runId: input.runId,
        symbol: input.symbol,
        round1,
        round2,
        round3,
        consensus,
      };
    } catch (error) {
      await this.prisma.agent_debate.update({
        where: { id: debate.id },
        data: {
          status: 'failed',
          completed_at: new Date(),
          error_message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  calculateConsensus(
    input: DebateSignalInput,
    round3: AgentRoundOpinion[],
  ): ConsensusResult {
    const identity = this.agentsFactory.listIdentities();
    const identityMap = new Map(identity.map((row) => [row.name, row]));

    const votes = {
      select: 0,
      pass: 0,
      abstain: 0,
      reject: 0,
    };

    let weightedSelect = 0;
    let weightedTotal = 0;
    let riskVetoed = false;

    for (const opinion of round3) {
      votes[opinion.vote] += 1;
      const meta = identityMap.get(opinion.agent);
      const baseWeight = meta?.voteWeight ?? 1;
      // Sprint 12: adjust weight by historical accuracy
      const weight = this.getAccuracyAdjustedWeight(opinion.agent, baseWeight);
      const weighted = weight * opinion.confidence;
      weightedTotal += weighted;
      if (opinion.vote === 'select') {
        weightedSelect += weighted;
      }
      if (opinion.agent === 'Risk Manager' && opinion.vote === 'reject') {
        riskVetoed = true;
      }
    }

    const weightedApprovalPct =
      weightedTotal <= 0 ? 0 : Number(((weightedSelect / weightedTotal) * 100).toFixed(4));

    const selectCount = votes.select;
    const consensusStrength = this.resolveConsensusStrength(selectCount);

    const confidenceAdjustedScore =
      input.compositeScore === null
        ? null
        : Number(((input.compositeScore ?? 0) * (weightedApprovalPct / 100)).toFixed(4));

    const consensus: ConsensusResult = {
      consensus: 'pass',
      consensusStrength,
      votes,
      weightedApprovalPct,
      riskVetoed,
      confidenceAdjustedScore,
      keyThesis: round3
        .filter((opinion) => opinion.vote === 'select')
        .sort((a, b) => b.confidence - a.confidence)[0]?.thesis ??
        'No strong bullish thesis formed.',
      keyRisk:
        round3
          .filter((opinion) => opinion.vote === 'reject' || opinion.vote === 'pass')
          .sort((a, b) => b.confidence - a.confidence)[0]?.keyRisk ??
        'No material risk raised.',
      dissentingViews: round3
        .filter((opinion) => opinion.vote !== 'select')
        .map((opinion) => `${opinion.agent}: ${opinion.keyRisk}`)
        .slice(0, 4),
    };

    if (riskVetoed) {
      consensus.consensus = 'hard_reject';
      consensus.consensusStrength = 'strong';
      return consensus;
    }

    const meetsScoreThreshold = (input.normalizedScore ?? 0) >= 70;
    if (selectCount >= 6 && weightedApprovalPct >= 70 && meetsScoreThreshold) {
      consensus.consensus = 'select';
    }

    return consensus;
  }

  /**
   * Adjust agent vote weight by historical accuracy (Sprint 12 — Task 6.1).
   *
   * Formula: effective_weight = base_weight * (0.7 + 0.6 * accuracy)
   * - 50% accuracy → 1.0x base (neutral)
   * - 80% accuracy → 1.18x base (boosted)
   * - 30% accuracy → 0.88x base (reduced)
   * Clamped to [base * 0.75, base * 1.30].
   *
   * Risk Manager's veto power is NOT adjusted — structural, not performance-based.
   * Minimum 30 closed trades per agent before any adjustment.
   */
  private getAccuracyAdjustedWeight(agentName: string, baseWeight: number): number {
    // Risk Manager weight is structural — never adjusted
    if (agentName === 'Risk Manager') return baseWeight;

    // TODO: Query rolling accuracy from agents.service.getStats()
    // For now, use base weights until 30+ trades per agent are available.
    // When wired: const accuracy = this.agentsService.getAgentAccuracy(agentName);
    // if (accuracy === null || accuracy.sampleSize < 30) return baseWeight;
    // const factor = 0.7 + 0.6 * accuracy.accuracyPct;
    // return Math.max(baseWeight * 0.75, Math.min(baseWeight * 1.30, baseWeight * factor));

    return baseWeight;
  }

  private resolveConsensusStrength(selectCount: number): ConsensusResult['consensusStrength'] {
    if (selectCount >= 10) return 'unanimous';
    if (selectCount >= 8) return 'strong';
    if (selectCount >= 6) return 'moderate';
    if (selectCount >= 5) return 'weak';
    return 'no_consensus';
  }

  private async buildInput(
    signalId: number,
    runId: string,
    symbol: string,
    date: Date,
    scores: {
      composite_score: number | null;
      composite_score_normalized: number | null;
      score_confidence: number | null;
      category_scores: Prisma.JsonValue | null;
    },
  ): Promise<DebateSignalInput> {
    const [breakdownRows, optionRows, bars] = await Promise.all([
      this.prisma.score_breakdown.findMany({
        where: { signal_id: signalId },
        orderBy: [{ category: 'asc' }, { sub_score_name: 'asc' }],
      }),
      this.prisma.option_chain_snapshot.findMany({
        where: { underlying_symbol: symbol },
        orderBy: { snapshot_ts: 'desc' },
        take: 60,
      }),
      this.prisma.market_bar.findMany({
        where: { symbol, date: { lte: date } },
        orderBy: { date: 'desc' },
        take: 30,
      }),
    ]);

    const categoryScores = this.normalizeCategoryScores(scores.category_scores);

    return {
      signalId,
      runId,
      symbol,
      date,
      compositeScore: scores.composite_score,
      normalizedScore: scores.composite_score_normalized,
      confidence: scores.score_confidence,
      categoryScores,
      scoreBreakdown: breakdownRows.map((row) => ({
        category: row.category,
        subScoreName: row.sub_score_name,
        rawValue: row.raw_value !== null ? Number(row.raw_value) : null,
        scaledScore: row.scaled_score !== null ? Number(row.scaled_score) : null,
        maxPossible: Number(row.max_possible),
        dataSource: row.data_source,
        isNull: row.is_null,
      })),
      optionsContext: optionRows.map((row) => ({
        expiration: row.expiration,
        strike: Number(row.strike),
        optionType: row.option_type as 'call' | 'put',
        impliedVolatility:
          row.implied_volatility !== null ? Number(row.implied_volatility) : null,
        delta: row.delta !== null ? Number(row.delta) : null,
        volume: row.volume,
        openInterest: row.open_interest,
      })),
      marketContext: {
        recentCloses: bars.map((bar) => bar.close),
        recentVolumes: bars.map((bar) => Number(bar.volume)),
        latestClose: bars[0]?.close ?? null,
        latestVolume: bars[0] ? Number(bars[0].volume) : null,
        avg20Volume:
          bars.length === 0
            ? null
            : Number(
                (
                  bars.slice(0, 20).reduce((sum, bar) => sum + Number(bar.volume), 0) /
                  Math.max(1, Math.min(20, bars.length))
                ).toFixed(2),
              ),
      },
    };
  }

  private normalizeCategoryScores(
    value: Prisma.JsonValue | null,
  ): Record<string, number | null> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const out: Record<string, number | null> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        out[key] = raw;
      } else {
        out[key] = null;
      }
    }

    return out;
  }

  private async persistRound(
    debateId: bigint,
    input: DebateSignalInput,
    runId: string,
    round: 1 | 2 | 3,
    opinions: AgentRoundOpinion[],
  ): Promise<void> {
    const opinionRows = opinions.map((opinion) => ({
      debate_id: debateId,
      signal_id: input.signalId,
      run_id: runId,
      agent_name: opinion.agent,
      round_number: round,
      category_score: opinion.categoryScore,
      conviction: opinion.conviction,
      thesis: opinion.thesis,
      key_risk: opinion.keyRisk,
      vote: opinion.vote,
      confidence_score: opinion.confidence,
      challenge_payload: opinion.challenges
        ? (JSON.parse(JSON.stringify(opinion.challenges)) as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      response_payload: opinion.responses
        ? (JSON.parse(JSON.stringify(opinion.responses)) as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      prompt_version: opinion.promptVersion,
      metadata: opinion.metadata
        ? (JSON.parse(JSON.stringify(opinion.metadata)) as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    }));

    await this.prisma.agent_opinion.createMany({ data: opinionRows });

    await this.prisma.debate_transcript.create({
      data: {
        debate_id: debateId,
        round_number: round,
        transcript: JSON.parse(JSON.stringify(opinions)) as Prisma.InputJsonValue,
      },
    });

    await this.prisma.agent_vote.createMany({
      data: opinions.map((opinion) => ({
        debate_id: debateId,
        run_id: runId,
        signal_id: input.signalId,
        agent_name: opinion.agent,
        agent_role: opinion.conviction,
        round_number: round,
        vote: opinion.vote,
        confidence_score: opinion.confidence,
        score: opinion.categoryScore,
        rationale: opinion.thesis,
        transcript: JSON.parse(JSON.stringify(opinion)) as Prisma.InputJsonValue,
      })),
    });
  }

  private async persistConsensus(
    debateId: bigint,
    input: DebateSignalInput,
    consensus: ConsensusResult,
  ): Promise<void> {
    await this.prisma.consensus_result.create({
      data: {
        debate_id: debateId,
        signal_id: input.signalId,
        symbol: input.symbol,
        final_decision: consensus.consensus,
        consensus_strength: consensus.consensusStrength,
        weighted_approval_pct: consensus.weightedApprovalPct,
        confidence_adjusted_score: consensus.confidenceAdjustedScore,
        risk_vetoed: consensus.riskVetoed,
        votes: JSON.parse(JSON.stringify(consensus.votes)) as Prisma.InputJsonValue,
        key_thesis: consensus.keyThesis,
        key_risk: consensus.keyRisk,
        dissenting_views: JSON.parse(
          JSON.stringify(consensus.dissentingViews),
        ) as Prisma.InputJsonValue,
      },
    });
  }
}
