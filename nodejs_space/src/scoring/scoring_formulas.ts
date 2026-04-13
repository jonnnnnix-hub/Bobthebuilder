import {
  CategoryScoreResult,
  CompositeConfidence,
  ScoreComponentResult,
} from './interfaces.js';

export const CATEGORY_MAX_POINTS = {
  vrp: 30,
  ivz: 30,
  term: 30,
  skew: 25,
  momentum: 25,
  flow: 25,
  regime_risk: 35,
} as const;

export const TOTAL_MAX_POINTS = Object.values(CATEGORY_MAX_POINTS).reduce(
  (sum, value) => sum + value,
  0,
);

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function scaleLinear(
  value: number | null,
  floor: number,
  ceiling: number,
  maxPoints: number,
): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (ceiling <= floor) return value > floor ? maxPoints : 0;
  if (value <= floor) return 0;
  if (value >= ceiling) return maxPoints;

  const ratio = (value - floor) / (ceiling - floor);
  return round4(clamp(ratio, 0, 1) * maxPoints);
}

export function scaleBand(
  value: number | null,
  ranges: Array<{ min: number; max: number; score: number }>,
  defaultScore = 0,
): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const match = ranges.find((range) => value >= range.min && value < range.max);
  return match ? match.score : defaultScore;
}

export function percentile(
  value: number | null,
  values: number[],
): number | null {
  if (value === null || !Number.isFinite(value) || values.length === 0)
    return null;
  const sorted = [...values]
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  const rank = sorted.filter((v) => v < value).length;
  return round4((rank / sorted.length) * 100);
}

export function categoryFromComponents(
  category: CategoryScoreResult['category'],
  maxPoints: number,
  components: ScoreComponentResult[],
): CategoryScoreResult {
  const availableMaxPoints = components.reduce(
    (sum, component) =>
      sum + (component.scaledScore === null ? 0 : component.maxPoints),
    0,
  );
  const score = round4(
    components.reduce(
      (sum, component) => sum + (component.scaledScore ?? 0),
      0,
    ),
  );

  return {
    category,
    score,
    maxPoints,
    availableMaxPoints,
    components,
  };
}

export function normalizeScore(
  totalScore: number,
  totalMaxPoints: number,
): number {
  if (
    !Number.isFinite(totalScore) ||
    !Number.isFinite(totalMaxPoints) ||
    totalMaxPoints <= 0
  ) {
    return 0;
  }
  return round4(clamp((totalScore / totalMaxPoints) * 100, 0, 100));
}

export function buildConfidence(
  categories: CategoryScoreResult[],
  normalizedScore: number,
): CompositeConfidence {
  const categoryCount = categories.length;
  const fullyAvailable = categories.filter(
    (category) => category.availableMaxPoints > 0,
  ).length;
  const coverage = categoryCount === 0 ? 0 : fullyAvailable / categoryCount;

  // Data confidence (coverage) blended with signal confidence (distance from 50 midpoint).
  const distanceFromMiddle = Math.abs(normalizedScore - 50) / 50;
  const confidenceScore = round4(
    clamp(coverage * 0.7 + distanceFromMiddle * 0.3, 0, 1),
  );
  const halfWidth = round4((1 - confidenceScore) * 18);

  return {
    coverage: round4(coverage),
    score: confidenceScore,
    low: round4(clamp(normalizedScore - halfWidth, 0, 100)),
    high: round4(clamp(normalizedScore + halfWidth, 0, 100)),
  };
}
