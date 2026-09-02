import type { PlaceSummary } from '@/lib/places/types';
import type { Signal } from '@/lib/scoring/signals';

/**
 * Zet gedetecteerde signalen om in regels die op een gedrukte flyer mogen.
 *
 * Dit is het gevoeligste stuk van de applicatie. Deze zinnen gaan gedrukt bij
 * iemand door de brievenbus, met zijn bedrijfsnaam erboven. Een fout feit kost
 * je dat bedrijf, en je hoort het pas als er geïrriteerd gebeld wordt.
 *
 * Daarom drie regels:
 *
 * 1. Alleen FEITEN. Gevolgtrekkingen en aanbevelingen komen er niet in.
 * 2. Alleen signalen waar we voldoende zeker van zijn. Een copyrightjaartal
 *    (zekerheid 0,55) zegt te weinig en valt af.
 * 3. Elke zin beschrijft wat WIJ hebben waargenomen, niet wat er waar is over
 *    het bedrijf. "Wij vonden geen aanvraagformulier" blijft kloppen ook als er
 *    er een achter JavaScript zit; "u heeft geen aanvraagformulier" niet.
 */

const MIN_CONFIDENCE = 0.6;

/** Minder dan dit aantal waarnemingen en we drukken geen flyer. */
export const MIN_OBSERVATIONS = 2;

export type Observation = {
  key: string;
  title: string;
  body: string;
};

type Builder = (signal: Signal, place: PlaceSummary) => Observation | null;

/**
 * Alleen deze signalen mogen op een flyer, en alleen in hun negatieve vorm —
 * een gemis is iets om over te praten, "u heeft wel een formulier" niet.
 */
const BUILDERS: Record<string, Builder> = {
  has_request_form: (signal) =>
    signal.normalized === 0
      ? {
          key: 'has_request_form',
          title: 'Wij vonden geen aanvraagformulier op uw site',
          body: "Wie 's avonds iets wil laten uitzoeken, kan alleen wachten tot er iemand opneemt.",
        }
      : null,

  mobile_friendly: (signal) =>
    signal.normalized === 0
      ? {
          key: 'mobile_friendly',
          title: 'Op een telefoon schaalt de site niet mee',
          body: 'Terwijl de meeste bezoekers juist op een klein scherm kijken.',
        }
      : null,

  shows_reviews: (signal, place) => {
    // Alleen interessant als er ook echt iets te laten zien is.
    if (signal.normalized !== 0) return null;
    const count = place.reviewCount ?? 0;
    const rating = place.rating;
    if (count < 20 || rating === null) return null;

    return {
      key: 'shows_reviews',
      title: `${count} reviews op Google, gemiddeld een ${rating.toFixed(1).replace('.', ',')}`,
      body: 'Dat is een sterk cijfer. Op uw eigen site komt het alleen nergens terug.',
    };
  },

  https: (signal) =>
    signal.normalized === 0
      ? {
          key: 'https',
          title: 'De site gebruikt nog geen beveiligde verbinding',
          body: 'Browsers waarschuwen bezoekers daar tegenwoordig zichtbaar voor.',
        }
      : null,
};

/** Volgorde waarin waarnemingen op de flyer komen; sterkste eerst. */
const PRIORITY = ['has_request_form', 'shows_reviews', 'mobile_friendly', 'https'];

export function observationsForFlyer(
  signals: Signal[],
  place: PlaceSummary,
): Observation[] {
  // Was de site onbereikbaar, dan weten we van de rest niets. Een flyer die
  // beweert dat iemands website plat lag terwijl het een storing van vijf
  // minuten was, is precies de fout die we niet willen maken.
  const reachable = signals.find((s) => s.key === 'site_reachable');
  if (reachable && reachable.normalized === 0) return [];

  const found = new Map<string, Observation>();

  for (const signal of signals) {
    if (signal.kind !== 'fact') continue;
    if (signal.confidence < MIN_CONFIDENCE) continue;

    const build = BUILDERS[signal.key];
    if (!build) continue;

    const observation = build(signal, place);
    if (observation) found.set(observation.key, observation);
  }

  return PRIORITY.map((key) => found.get(key))
    .filter((o): o is Observation => o !== undefined)
    .slice(0, 3);
}

/** Kan er een gepersonaliseerde flyer gemaakt worden, en zo nee waarom niet. */
export function flyerReadiness(
  signals: Signal[],
  place: PlaceSummary,
): { ready: boolean; observations: Observation[]; reason?: string } {
  if (signals.length === 0) {
    return { ready: false, observations: [], reason: 'Nog niet geanalyseerd.' };
  }

  const observations = observationsForFlyer(signals, place);

  if (observations.length < MIN_OBSERVATIONS) {
    return {
      ready: false,
      observations,
      reason:
        observations.length === 0
          ? 'Niets concreets gevonden om te benoemen.'
          : 'Te weinig gevonden voor een gepersonaliseerde flyer — gebruik de generieke.',
    };
  }

  return { ready: true, observations };
}
