import { Injectable } from '@nestjs/common';
import { BaseDebateAgent } from './base-agent.js';
import { AgentIdentity, AgentName } from './interfaces.js';
import { AgentLlmService } from './llm.service.js';

const AGENT_IDENTITIES: AgentIdentity[] = [
  {
    name: 'VRP Specialist',
    role: 'Volatility Risk Premium specialist',
    expertise: 'IV vs realized volatility divergence',
    promptVersion: 'v1',
    voteWeight: 1.1,
    focusCategories: ['vrp'],
  },
  {
    name: 'Statistical Edge Analyst',
    role: 'IV z-score and statistical distribution analyst',
    expertise: 'Distributional anomaly detection',
    promptVersion: 'v1',
    voteWeight: 1.05,
    focusCategories: ['ivz'],
  },
  {
    name: 'Term Structure Specialist',
    role: 'Term structure and skew interpreter',
    expertise: 'Term slope inversion and skew signals',
    promptVersion: 'v1',
    voteWeight: 1.0,
    focusCategories: ['term', 'skew'],
  },
  {
    name: 'Technical Momentum Analyst',
    role: 'Momentum and trend setup analyst',
    expertise: 'RSI/price-volume behavior',
    promptVersion: 'v1',
    voteWeight: 0.95,
    focusCategories: ['momentum'],
  },
  {
    name: 'Options Flow Analyst',
    role: 'Options flow and positioning analyst',
    expertise: 'Open-interest concentration and unusual activity',
    promptVersion: 'v1',
    voteWeight: 1.0,
    focusCategories: ['flow'],
  },
  {
    name: 'Market Regime Analyst',
    role: 'Macro regime interpreter',
    expertise: 'Regime compatibility and correlation context',
    promptVersion: 'v1',
    voteWeight: 1.0,
    focusCategories: ['regime_risk'],
  },
  {
    name: 'Risk Manager',
    role: 'Risk governance owner',
    expertise: 'Tail-risk mitigation, veto authority',
    promptVersion: 'v1',
    voteWeight: 1.4,
    focusCategories: ['regime_risk'],
  },
  {
    name: 'Contrarian Analyst',
    role: 'Devil\'s advocate',
    expertise: 'Failure mode and consensus bias detection',
    promptVersion: 'v1',
    voteWeight: 0.9,
    focusCategories: ['ivz', 'regime_risk'],
  },
  {
    name: 'Historical Pattern Analyst',
    role: 'Historical analog specialist',
    expertise: 'Pattern recurrence and seasonality',
    promptVersion: 'v1',
    voteWeight: 0.95,
    focusCategories: ['vrp', 'ivz', 'momentum'],
  },
  {
    name: 'Meta-Strategist',
    role: 'Final synthesis and recommendation lead',
    expertise: 'Cross-agent synthesis and decision quality control',
    promptVersion: 'v1',
    voteWeight: 1.2,
    focusCategories: ['vrp', 'ivz', 'term', 'skew', 'momentum', 'flow', 'regime_risk'],
  },
  // Agent #11 — Sprint 12: fills the real-time flow gap
  {
    name: 'Market Microstructure Specialist',
    role: 'Order flow and liquidity microstructure analyst',
    expertise:
      'Options flow dynamics — volume/OI spikes, put-call skew shifts, ' +
      'large block trades, bid-ask spread quality, and institutional positioning signals. ' +
      'Analyzes raw options chain volume/OI data, not just pre-computed flow scores.',
    promptVersion: 'v1',
    voteWeight: 1.05,
    focusCategories: ['flow', 'regime_risk'],
  },
];

@Injectable()
export class SpecialistAgentsFactory {
  constructor(private readonly llmService: AgentLlmService) {}

  createAgents(): BaseDebateAgent[] {
    return AGENT_IDENTITIES.map(
      (identity) => new BaseDebateAgent(identity, this.llmService),
    );
  }

  getAgentIdentity(name: AgentName): AgentIdentity | undefined {
    return AGENT_IDENTITIES.find((agent) => agent.name === name);
  }

  listIdentities(): AgentIdentity[] {
    return [...AGENT_IDENTITIES];
  }
}
