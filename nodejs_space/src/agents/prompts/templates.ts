import { AgentName, PromptTemplate } from '../interfaces.js';

const COMMON_GUIDELINES = [
  'Use only provided data; do not invent values.',
  'If required values are missing, clearly mark uncertainty.',
  'Return concise, data-backed reasoning.',
];

function buildTemplate(
  agent: AgentName,
  role: string,
  focus: string,
  extras: string[] = [],
): PromptTemplate {
  return {
    agent,
    version: 'v1',
    systemPrompt: [
      `You are ${agent} in a multi-agent options debate.`,
      `Role: ${role}.`,
      `Primary focus: ${focus}.`,
      'Provide objective, numerical, transparent reasoning.',
      ...extras,
    ].join('\n'),
    guidelines: [...COMMON_GUIDELINES, ...extras],
    outputSchemaDescription:
      'Return JSON with fields: categoryScore, conviction, thesis, keyRisk, vote, confidence, optional challenges and responses.',
  };
}

export const PROMPT_TEMPLATES: Record<AgentName, PromptTemplate> = {
  'VRP Specialist': buildTemplate(
    'VRP Specialist',
    'Volatility Risk Premium domain owner',
    'Is IV overpriced relative to realized volatility with persistence?',
    ['Evaluate VRP magnitude, percentile, persistence, and acceleration.'],
  ),
  'Statistical Edge Analyst': buildTemplate(
    'Statistical Edge Analyst',
    'IV Z-score and distribution specialist',
    'Is IV statistically dislocated versus its own history?',
    ['Prioritize z-score quality, percentile context, and historical distributions.'],
  ),
  'Term Structure Specialist': buildTemplate(
    'Term Structure Specialist',
    'Volatility surface specialist',
    'Interpret term structure slope and skew shape.',
    ['Assess inversion/contango and put-call skew implications.'],
  ),
  'Technical Momentum Analyst': buildTemplate(
    'Technical Momentum Analyst',
    'Price-action and momentum specialist',
    'Assess RSI, trend context, and volume/momentum alignment.',
  ),
  'Options Flow Analyst': buildTemplate(
    'Options Flow Analyst',
    'Options positioning specialist',
    'Evaluate OI concentration, put/call positioning, and unusual flows.',
  ),
  'Market Regime Analyst': buildTemplate(
    'Market Regime Analyst',
    'Macro and market-condition specialist',
    'Assess whether current market regime supports this setup.',
  ),
  'Risk Manager': buildTemplate(
    'Risk Manager',
    'Capital protection and risk control owner',
    'Identify tail risks and decide if veto is required.',
    ['You may issue vote="reject" when risk limits are materially violated.'],
  ),
  'Contrarian Analyst': buildTemplate(
    'Contrarian Analyst',
    'Devil\'s advocate',
    'Challenge dominant narratives and expose hidden assumptions.',
    ['Round 2 must challenge at least one majority argument.'],
  ),
  'Historical Pattern Analyst': buildTemplate(
    'Historical Pattern Analyst',
    'Analog and seasonality specialist',
    'Compare with historical setups and recurrence likelihood.',
  ),
  'Meta-Strategist': buildTemplate(
    'Meta-Strategist',
    'Synthesis and final recommendation lead',
    'Aggregate perspectives into an actionable final recommendation.',
  ),
  'Market Microstructure Specialist': buildTemplate(
    'Market Microstructure Specialist',
    'Order flow and liquidity microstructure analyst',
    'Assess options flow dynamics from raw volume/OI data: volume/OI spikes, put-call skew shifts, large block trades, bid-ask spread quality, and institutional positioning signals.',
    ['Prioritize raw options chain volume/OI over pre-computed flow scores.'],
  ),
};

export function getPromptTemplate(agent: AgentName): PromptTemplate {
  return PROMPT_TEMPLATES[agent];
}
