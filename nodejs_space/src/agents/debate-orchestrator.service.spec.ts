import { DebateOrchestratorService } from './debate-orchestrator.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SpecialistAgentsFactory } from './specialist-agents';
import type { AgentRoundOpinion, DebateSignalInput } from './interfaces';

describe('DebateOrchestratorService consensus', () => {
  const prismaMock = {} as PrismaService;
  const factoryMock = {
    listIdentities: jest.fn().mockReturnValue([
      { name: 'Risk Manager', voteWeight: 1.4 },
      { name: 'Meta-Strategist', voteWeight: 1.2 },
      { name: 'VRP Specialist', voteWeight: 1.1 },
      { name: 'Statistical Edge Analyst', voteWeight: 1.0 },
      { name: 'Term Structure Specialist', voteWeight: 1.0 },
      { name: 'Technical Momentum Analyst', voteWeight: 1.0 },
      { name: 'Options Flow Analyst', voteWeight: 1.0 },
      { name: 'Market Regime Analyst', voteWeight: 1.0 },
      { name: 'Market Microstructure Specialist', voteWeight: 1.05 },
      { name: 'Contrarian Analyst', voteWeight: 0.9 },
      { name: 'Historical Pattern Analyst', voteWeight: 0.9 },
    ]),
  } as unknown as SpecialistAgentsFactory;

  let service: DebateOrchestratorService;

  const baseInput: DebateSignalInput = {
    signalId: 1,
    runId: 'run_1',
    symbol: 'NVDA',
    date: new Date('2026-04-10T00:00:00.000Z'),
    compositeScore: 172,
    normalizedScore: 82,
    confidence: 0.78,
    categoryScores: {
      vrp: 33,
      ivz: 29,
      term: 24,
      skew: 21,
      momentum: 27,
      flow: 22,
      regime_risk: 20,
    },
  };

  beforeEach(() => {
    service = new DebateOrchestratorService(prismaMock, factoryMock);
  });

  it('returns select when supermajority and weighted approval pass threshold', () => {
    const agentNames: AgentRoundOpinion['agent'][] = [
      'Risk Manager',
      'Meta-Strategist',
      'VRP Specialist',
      'Statistical Edge Analyst',
      'Term Structure Specialist',
      'Technical Momentum Analyst',
      'Options Flow Analyst',
      'Market Regime Analyst',
      'Market Microstructure Specialist',
      'Contrarian Analyst',
      'Historical Pattern Analyst',
    ];

    const round3 = agentNames.map((agent, index) => ({
      agent,
      round: 3,
      categoryScore: 25,
      conviction: 'high',
      thesis: 'Strong setup',
      keyRisk: 'Normal risk',
      vote: index <= 7 ? 'select' : 'pass',
      confidence: 0.8,
      promptVersion: 'v1',
    })) as AgentRoundOpinion[];

    const consensus = service.calculateConsensus(baseInput, round3);
    expect(consensus.consensus).toBe('select');
    expect(consensus.weightedApprovalPct).toBeGreaterThanOrEqual(70);
  });

  it('returns hard_reject when risk manager vetoes', () => {
    const round3: AgentRoundOpinion[] = [
      {
        agent: 'Risk Manager',
        round: 3,
        categoryScore: 10,
        conviction: 'reject',
        thesis: 'Tail risk too high',
        keyRisk: 'Risk veto',
        vote: 'reject',
        confidence: 0.93,
        promptVersion: 'v1',
      },
      {
        agent: 'Meta-Strategist',
        round: 3,
        categoryScore: 28,
        conviction: 'high',
        thesis: 'Would otherwise select',
        keyRisk: 'none',
        vote: 'select',
        confidence: 0.75,
        promptVersion: 'v1',
      },
    ];

    const consensus = service.calculateConsensus(baseInput, round3);
    expect(consensus.consensus).toBe('hard_reject');
    expect(consensus.riskVetoed).toBe(true);
  });
});
