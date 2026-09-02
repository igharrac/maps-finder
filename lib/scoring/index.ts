import type { PlaceSummary } from '@/lib/places/types';
import { signalsFromPlace, type Signal } from './signals';
import { DEFAULT_WEIGHTS, MODEL_VERSION, type ScoringWeights } from './weights';

export type ScoreBreakdown = {
  modelVersion: string;
  opportunityScore: number;
  businessPotential: number;
  digitalMaturity: number;
  /** Hoe hard de score is. Laag zolang alleen Google-signalen beschikbaar zijn. */
  confidence: number;
  signals: Signal[];
  weights: ScoringWeights;
};

function pick(signals: Signal[], key: string): Signal | undefined {
  return signals.find((s) => s.key === key);
}

function weightedAverage(parts: Array<[number | null | undefined, number]>): {
  score: number;
  coverage: number;
} {
  let total = 0;
  let usedWeight = 0;
  let allWeight = 0;

  for (const [value, weight] of parts) {
    allWeight += weight;
    if (value === null || value === undefined) continue;
    total += value * weight;
    usedWeight += weight;
  }

  if (usedWeight === 0) return { score: 0, coverage: 0 };
  // Normaliseer over de wegingen die we daadwerkelijk konden invullen, zodat een
  // ontbrekend signaal de score niet stilzwijgend omlaag trekt.
  return { score: total / usedWeight, coverage: usedWeight / allWeight };
}

function toHundred(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 1) * 100);
}

/**
 * Berekent de scores uit de signalen.
 *
 * Twee deelscores in plaats van vijf: Business Potential zegt of het bedrijf
 * commercieel interessant is, Digital Maturity hoe ver het digitaal is. Een lage
 * digitale volwassenheid bij een hoog potentieel is precies de kans — vandaar
 * dat de eindscore rekent met de digitale ACHTERSTAND (100 − maturity).
 *
 * Een aparte AI-, UX- en marketingscore voegt op deze signalen niets toe: ze
 * zouden alle drie uit dezelfde handvol waarnemingen komen en vrijwel perfect
 * met elkaar correleren. Die splitsing hoort pas thuis als de
 * website-verrijking eigen signalen per invalshoek oplevert.
 */
export function scorePlace(
  place: PlaceSummary,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  extraSignals: Signal[] = [],
): ScoreBreakdown {
  const signals = [...signalsFromPlace(place), ...extraSignals];

  const business = weightedAverage([
    [pick(signals, 'review_volume')?.normalized, weights.businessPotential.reviewVolume],
    [pick(signals, 'rating')?.normalized, weights.businessPotential.rating],
    [pick(signals, 'category_fit')?.normalized, weights.businessPotential.categoryFit],
  ]);

  const digital = weightedAverage([
    [pick(signals, 'has_website')?.normalized, weights.digitalMaturity.hasWebsite],
    [pick(signals, 'has_request_form')?.normalized, weights.digitalMaturity.hasRequestForm],
    [pick(signals, 'mobile_friendly')?.normalized, weights.digitalMaturity.mobileFriendly],
    [pick(signals, 'shows_reviews')?.normalized, weights.digitalMaturity.showsReviews],
    [pick(signals, 'recently_updated')?.normalized, weights.digitalMaturity.recentlyUpdated],
  ]);

  const businessPotential = toHundred(business.score);
  const digitalMaturity = toHundred(digital.score);
  const digitalGap = 1 - digital.score;

  const opportunityScore = toHundred(
    business.score * weights.opportunity.businessPotential +
      digitalGap * weights.opportunity.digitalGap,
  );

  return {
    modelVersion: MODEL_VERSION,
    opportunityScore,
    businessPotential,
    digitalMaturity,
    // De digitale dekking is de zwakke schakel: met alleen Google weten we van
    // de website niet meer dan of hij bestaat.
    confidence: Number((business.coverage * 0.4 + digital.coverage * 0.6).toFixed(2)),
    signals,
    weights,
  };
}

export { DEFAULT_WEIGHTS, MODEL_VERSION };
export type { Signal, ScoringWeights };
