import type { PlaceSummary } from '@/lib/places/types';
import { CATEGORY_FIT, DEFAULT_CATEGORY_FIT } from './weights';

/**
 * Een waargenomen signaal. `kind` is bewust expliciet: een feit is iets dat we
 * gezien hebben, een aanname is een gevolgtrekking. De UI mag die twee nooit
 * door elkaar tonen en de AI-laag mag een aanname nooit als bedrijfsgegeven
 * presenteren.
 */
export type Signal = {
  key: string;
  kind: 'fact' | 'inference' | 'recommendation';
  label: string;
  value: unknown;
  /** Genormaliseerde bijdrage 0..1, of null als het signaal niet meeweegt. */
  normalized: number | null;
  confidence: number;
  detectedBy: string;
};

/** Dempt grote aantallen af: 0 reviews = 0, ~200 reviews ≈ 0,9. */
function normalizeReviewVolume(count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.log10(count + 1) / Math.log10(300), 1);
}

/** Onder de 3,0 vinden we het niet interessant; 5,0 is maximaal. */
function normalizeRating(rating: number): number {
  return Math.min(Math.max((rating - 3) / 2, 0), 1);
}

/**
 * Leidt signalen af uit wat Google levert. Dit is bewust mager: Google kent
 * geen omzet, personeelsomvang of rechtsvorm, en zegt niets over de website
 * behalve of er één is. De echte onderscheidende signalen komen uit de
 * website-verrijking, die hier later bij komt.
 */
export function signalsFromPlace(place: PlaceSummary): Signal[] {
  const signals: Signal[] = [];

  const reviewCount = place.reviewCount ?? 0;
  signals.push({
    key: 'review_volume',
    kind: 'fact',
    label:
      reviewCount > 0
        ? `${reviewCount} reviews op Google`
        : 'Geen reviews op Google',
    value: reviewCount,
    normalized: normalizeReviewVolume(reviewCount),
    confidence: 1,
    detectedBy: 'google_places',
  });

  if (place.rating !== null) {
    signals.push({
      key: 'rating',
      kind: 'fact',
      label: `Gemiddelde beoordeling ${place.rating.toFixed(1).replace('.', ',')}`,
      value: place.rating,
      normalized: normalizeRating(place.rating),
      confidence: 1,
      detectedBy: 'google_places',
    });
  }

  const fit = place.primaryType
    ? (CATEGORY_FIT[place.primaryType] ?? DEFAULT_CATEGORY_FIT)
    : DEFAULT_CATEGORY_FIT;

  signals.push({
    key: 'category_fit',
    kind: 'inference',
    label: place.categoryLabel
      ? `Branche: ${place.categoryLabel}`
      : 'Branche onbekend',
    value: { primaryType: place.primaryType, fit },
    normalized: fit,
    // Een brancheschatting is geen waarneming; dat drukken we uit in confidence.
    confidence: place.primaryType ? 0.7 : 0.3,
    detectedBy: 'category_map',
  });

  const hasWebsite = Boolean(place.websiteUri);
  signals.push({
    key: 'has_website',
    kind: 'fact',
    label: hasWebsite
      ? 'Website bekend bij Google'
      : 'Geen website bekend bij Google',
    value: place.websiteUri ?? null,
    normalized: hasWebsite ? 1 : 0,
    confidence: 1,
    detectedBy: 'google_places',
  });

  return signals;
}
