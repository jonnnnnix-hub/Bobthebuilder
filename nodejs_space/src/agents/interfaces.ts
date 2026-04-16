export const AGENT_NAMES = [
  'VRP Specialist',
  'Statistical Edge Analyst',
  'Term Structure Specialist',
  'Technical Momentum Analyst',
  'Options Flow Analyst',
  'Market Regime Analyst',
  'Risk Manager',
  'Contrarian Analyst',
  'Historical Pattern Analyst',
  'Meta-Strategist',
  'Market Microstructure Specialist',
] as const;

export type AgentName = (typeof AGENT_NAMES)[number];
export type AgentVote = 'select' | 'pass' | 'abstain' | 'reject';
export type Conviction = 'high' | 'medium' | 'low' | 'reject';

export interface AgentIdentity {
  name: AgentName;
  role: string;
  expertise: string;
  promptVersion: string;
  voteWeight: number;
  focusCategories: string[];
}

export interface DebateSignalInput {
  signalId: number;
  runId: string;
  symbol: string;
  date: Date;
  compositeScore: number | null;
  normalizedScore: number | null;
  confidence: number | null;
  categoryScores: Record<string, number | null> | null;
  scoreBreakdown?: Array<{
    category: string;
    subScoreName: string;
    rawValue: number | null;
    scaledScore: number | null;
    maxPossible: number;
    dataSource: string | null;
    isNull: boolean;
  }>;
  optionsContext?: Array<{
    expiration: Date;
    strike: number;
    optionType: 'call' | 'put';
    impliedVolatility: number | null;
    delta: number | null;
    volume: number | null;
    openInterest: number | null;
  }>;
  marketContext?: {
    recentCloses: number[];
    recentVolumes: number[];
    latestClose: number | null;
    latestVolume: number | null;
    avg20Volume: number | null;
  };
}

export interface AgentRoundOpinion {
  agent: AgentName;
  round: 1 | 2 | 3;
  categoryScore: number | null;
  conviction: Conviction;
  thesis: string;
  keyRisk: string;
  vote: AgentVote;
  confidence: number;
  challenges?: Array<{
    targetAgent: AgentName;
    challenge: string;
    evidence: string;
    impact: string;
  }>;
  responses?: string[];
  promptVersion: string;
  metadata?: Record<string, unknown>;
}

export interface ConsensusResult {
  consensus: 'select' | 'pass' | 'hard_reject';
  consensusStrength: 'unanimous' | 'strong' | 'moderate' | 'weak' | 'no_consensus';
  votes: Record<AgentVote, number>;
  weightedApprovalPct: number;
  riskVetoed: boolean;
  confidenceAdjustedScore: number | null;
  keyThesis: string;
  keyRisk: string;
  dissentingViews: string[];
}

export interface DebateRunResult {
  debateId: bigint;
  signalId: number;
  runId: string;
  symbol: string;
  round1: AgentRoundOpinion[];
  round2: AgentRoundOpinion[];
  round3: AgentRoundOpinion[];
  consensus: ConsensusResult;
}

export interface PromptTemplate {
  agent: AgentName;
  version: string;
  systemPrompt: string;
  guidelines: string[];
  outputSchemaDescription: string;
}
