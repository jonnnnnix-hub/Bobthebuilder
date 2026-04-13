import {
  AgentIdentity,
  AgentRoundOpinion,
  AgentVote,
  DebateSignalInput,
} from './interfaces.js';
import { getPromptTemplate } from './prompts/templates.js';
import { AgentLlmService } from './llm.service.js';

const APPROVE_THRESHOLD = 0.66;
const PASS_THRESHOLD = 0.45;

export class BaseDebateAgent {
  constructor(
    readonly identity: AgentIdentity,
    protected readonly llmService: AgentLlmService,
  ) {}

  async analyzeRound1(input: DebateSignalInput): Promise<AgentRoundOpinion> {
    const deterministic = this.buildDeterministicOpinion(input, 1);
    const llmOpinion = await this.tryLlmOpinion(input, 1, deterministic);
    return llmOpinion ?? deterministic;
  }

  async analyzeRound2(
    input: DebateSignalInput,
    round1: AgentRoundOpinion[],
  ): Promise<AgentRoundOpinion> {
    const deterministic = this.buildDebateRoundOpinion(input, round1);
    const llmOpinion = await this.tryLlmOpinion(input, 2, deterministic, round1);
    return llmOpinion ?? deterministic;
  }

  async analyzeRound3(
    input: DebateSignalInput,
    round2: AgentRoundOpinion[],
  ): Promise<AgentRoundOpinion> {
    const deterministic = this.buildConsensusRoundOpinion(input, round2);
    const llmOpinion = await this.tryLlmOpinion(input, 3, deterministic, round2);
    return llmOpinion ?? deterministic;
  }

  private async tryLlmOpinion(
    input: DebateSignalInput,
    round: 1 | 2 | 3,
    fallback: AgentRoundOpinion,
    priorRound?: AgentRoundOpinion[],
  ): Promise<AgentRoundOpinion | null> {
    const template = getPromptTemplate(this.identity.name);
    const payload = {
      symbol: input.symbol,
      round,
      score_context: {
        composite_score: input.compositeScore,
        normalized_score: input.normalizedScore,
        confidence: input.confidence,
        category_scores: input.categoryScores,
      },
      prior_round: priorRound ?? [],
      fallback_expected_shape: fallback,
    };

    const response = await this.llmService.completeJson<Partial<AgentRoundOpinion>>({
      systemPrompt: template.systemPrompt,
      userPrompt: JSON.stringify(payload),
    });

    if (!response) return null;

    return {
      ...fallback,
      ...response,
      agent: this.identity.name,
      round,
      promptVersion: this.identity.promptVersion,
      confidence: this.boundConfidence(response.confidence ?? fallback.confidence),
      vote: this.normalizeVote(response.vote ?? fallback.vote),
      conviction: this.normalizeConviction(response.conviction ?? fallback.conviction),
    };
  }

  protected buildDeterministicOpinion(
    input: DebateSignalInput,
    round: 1 | 2 | 3,
  ): AgentRoundOpinion {
    const categoryScore = this.resolveFocusedScore(input);
    const normalized = this.resolveNormalizedSignal(input, categoryScore);
    const vote = this.voteFromNormalized(normalized);
    const confidence = this.boundConfidence(0.45 + normalized * 0.5);

    return {
      agent: this.identity.name,
      round,
      categoryScore,
      conviction: this.convictionFromVote(vote, confidence),
      thesis: `${this.identity.name}: focused score ${categoryScore?.toFixed(2) ?? 'n/a'} with normalized signal ${(normalized * 100).toFixed(1)}%.`,
      keyRisk: this.defaultRisk(input),
      vote,
      confidence,
      promptVersion: this.identity.promptVersion,
      metadata: {
        focusCategories: this.identity.focusCategories,
      },
    };
  }

  protected buildDebateRoundOpinion(
    input: DebateSignalInput,
    round1: AgentRoundOpinion[],
  ): AgentRoundOpinion {
    const base = this.buildDeterministicOpinion(input, 2);
    const selectVotes = round1.filter((opinion) => opinion.vote === 'select').length;
    const ratio = round1.length === 0 ? 0 : selectVotes / round1.length;

    const responses: string[] = [];
    if (ratio >= 0.7 && base.vote === 'pass') {
      responses.push('Majority conviction is strong; softening stance to abstain.');
      base.vote = 'abstain';
      base.confidence = this.boundConfidence(base.confidence - 0.1);
    }

    if (this.identity.name === 'Contrarian Analyst') {
      const strongest = round1
        .filter((opinion) => opinion.vote === 'select')
        .sort((a, b) => b.confidence - a.confidence)[0];
      if (strongest) {
        base.challenges = [
          {
            targetAgent: strongest.agent,
            challenge: 'Potential consensus blind spot: setup may be regime-driven rather than idiosyncratic.',
            evidence: 'Cross-signal clustering observed in recent selected candidates.',
            impact: 'Reduce confidence by ~0.1 until confirming independent catalyst.',
          },
        ];
      }
    }

    base.responses = responses;
    base.conviction = this.convictionFromVote(base.vote, base.confidence);
    return base;
  }

  protected buildConsensusRoundOpinion(
    input: DebateSignalInput,
    round2: AgentRoundOpinion[],
  ): AgentRoundOpinion {
    const base = this.buildDeterministicOpinion(input, 3);
    const weightedSelect = round2.filter((opinion) => opinion.vote === 'select').length;
    if (weightedSelect >= Math.ceil(round2.length * 0.7)) {
      base.thesis += ' Majority agreement supports execution readiness.';
      base.confidence = this.boundConfidence(base.confidence + 0.08);
      if (base.vote === 'pass') {
        base.vote = 'abstain';
      }
    }

    if (this.identity.name === 'Meta-Strategist') {
      base.thesis =
        'Synthesis: balancing specialist conviction, dissent, and risk constraints for final recommendation.';
    }

    if (this.identity.name === 'Risk Manager' && this.isHighRisk(input)) {
      base.vote = 'reject';
      base.conviction = 'reject';
      base.confidence = 0.9;
      base.keyRisk = 'Risk veto triggered: weak score confidence and unstable volatility profile.';
    }

    return base;
  }

  private resolveFocusedScore(input: DebateSignalInput): number | null {
    if (!input.categoryScores) return null;
    const values = this.identity.focusCategories
      .map((key) => input.categoryScores?.[key] ?? null)
      .filter((value): value is number => value !== null && Number.isFinite(value));

    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private resolveNormalizedSignal(
    input: DebateSignalInput,
    categoryScore: number | null,
  ): number {
    if (typeof input.normalizedScore === 'number' && Number.isFinite(input.normalizedScore)) {
      return Math.min(1, Math.max(0, input.normalizedScore / 100));
    }

    if (categoryScore === null) return 0.4;
    return Math.min(1, Math.max(0, categoryScore / 40));
  }

  private voteFromNormalized(normalized: number): AgentVote {
    if (normalized >= APPROVE_THRESHOLD) return 'select';
    if (normalized >= PASS_THRESHOLD) return 'abstain';
    return 'pass';
  }

  private convictionFromVote(vote: AgentVote, confidence: number): 'high' | 'medium' | 'low' | 'reject' {
    if (vote === 'reject') return 'reject';
    if (confidence >= 0.78) return 'high';
    if (confidence >= 0.6) return 'medium';
    return 'low';
  }

  private normalizeVote(vote: AgentVote): AgentVote {
    if (vote === 'select' || vote === 'pass' || vote === 'abstain' || vote === 'reject') {
      return vote;
    }
    return 'pass';
  }

  private normalizeConviction(
    conviction: AgentRoundOpinion['conviction'],
  ): AgentRoundOpinion['conviction'] {
    if (conviction === 'high' || conviction === 'medium' || conviction === 'low' || conviction === 'reject') {
      return conviction;
    }
    return 'low';
  }

  protected defaultRisk(input: DebateSignalInput): string {
    const lowConfidence = (input.confidence ?? 0.5) < 0.5;
    if (lowConfidence) {
      return 'Composite confidence is below preferred threshold.';
    }
    return 'Unexpected volatility expansion could invalidate edge.';
  }

  protected isHighRisk(input: DebateSignalInput): boolean {
    const normalized = input.normalizedScore ?? 0;
    const confidence = input.confidence ?? 0;
    return normalized < 55 || confidence < 0.45;
  }

  protected boundConfidence(value: number): number {
    return Math.max(0, Math.min(1, Number(value.toFixed(4))));
  }
}
