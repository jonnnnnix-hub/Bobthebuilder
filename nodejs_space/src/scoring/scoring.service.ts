import { Injectable } from '@nestjs/common';
import {
  CompositeSelectionReason,
  CompositeScoreResult,
  RankedCompositeScore,
  ScoringConfig,
  ScoreUniverseContext,
  SymbolScoringInput,
} from './interfaces.js';
import {
  buildConfidence,
  normalizeScore,
  round4,
  TOTAL_MAX_POINTS,
} from './scoring_formulas.js';
import { scoreVrpCategory } from './categories/vrp-score.js';
import { scoreIvzCategory } from './categories/ivz-score.js';
import { scoreTermStructureCategory } from './categories/term-structure-score.js';
import { scoreSkewCategory } from './categories/skew-score.js';
import { scoreMomentumCategory } from './categories/momentum-score.js';
import { scoreFlowCategory } from './categories/flow-score.js';
import { scoreRegimeRiskCategory } from './categories/regime-risk-score.js';

@Injectable()
export class ScoringService {
  scoreUniverse(inputs: SymbolScoringInput[]): CompositeScoreResult[] {
    const context: ScoreUniverseContext = {
      vrpValues: inputs
        .map((input) => input.vrp20)
        .filter((value): value is number => value !== null),
      ivzValues: inputs
        .map((input) => input.ivZ)
        .filter((value): value is number => value !== null),
    };

    return inputs.map((input) => this.scoreSymbol(input, context));
  }

  rankAndSelect(
    scored: CompositeScoreResult[],
    config: ScoringConfig,
  ): RankedCompositeScore[] {
    const threshold = config.compositeThresholdPct;
    const rankable: RankedCompositeScore[] = scored
      .map((result) => ({
        ...result,
        rank: null as number | null,
        selected: false,
        selectionReason: this.resolveMissingReason(result),
      }))
      .sort((left, right) => right.normalizedScore - left.normalizedScore);

    rankable.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    const aboveThreshold = rankable.filter(
      (item) => item.normalizedScore >= threshold,
    );
    const selected = aboveThreshold.slice(0, config.topN);
    const selectedSymbols = new Set(selected.map((item) => item.symbol));

    for (const item of rankable) {
      if (selectedSymbols.has(item.symbol)) {
        item.selected = true;
        item.selectionReason = 'selected';
        continue;
      }
      if (item.selectionReason.startsWith('missing_')) {
        continue;
      }
      item.selectionReason =
        item.normalizedScore >= threshold
          ? 'passed_thresholds_but_outside_top_n'
          : 'below_composite_threshold';
    }

    return rankable;
  }

  private scoreSymbol(
    input: SymbolScoringInput,
    context: ScoreUniverseContext,
  ): CompositeScoreResult {
    const vrp = scoreVrpCategory(input, context);
    const ivz = scoreIvzCategory(input, context);
    const term = scoreTermStructureCategory(input);
    const skew = scoreSkewCategory(input);
    const momentum = scoreMomentumCategory(input);
    const flow = scoreFlowCategory(input);
    const regimeRisk = scoreRegimeRiskCategory(input);

    const categories = {
      vrp,
      ivz,
      term,
      skew,
      momentum,
      flow,
      regime_risk: regimeRisk,
    };

    const totalScore = round4(
      Object.values(categories).reduce(
        (sum, category) => sum + category.score,
        0,
      ),
    );
    const totalMaxPoints = Object.values(categories).reduce(
      (sum, category) => sum + category.availableMaxPoints,
      0,
    );
    const effectiveMax = totalMaxPoints > 0 ? totalMaxPoints : TOTAL_MAX_POINTS;
    const normalizedScore = normalizeScore(totalScore, effectiveMax);
    const confidence = buildConfidence(
      Object.values(categories),
      normalizedScore,
    );

    return {
      symbol: input.symbol,
      totalScore,
      totalMaxPoints: effectiveMax,
      normalizedScore,
      confidence,
      categories,
    };
  }

  private resolveMissingReason(
    result: CompositeScoreResult,
  ): CompositeSelectionReason {
    const vrpComponent = result.categories.vrp.components.find(
      (component) => component.name === 'vrp_magnitude',
    );
    const ivzComponent = result.categories.ivz.components.find(
      (component) => component.name === 'iv_z_current',
    );

    const missingVrp = vrpComponent?.scaledScore === null;
    const missingIvz = ivzComponent?.scaledScore === null;

    if (missingVrp && missingIvz) return 'missing_vrp_20_and_iv_z';
    if (missingVrp) return 'missing_vrp_20';
    if (missingIvz) return 'missing_iv_z';

    return 'below_composite_threshold';
  }
}
