import type { PlaceSummary } from '@/lib/places/types';
import type { Signal } from '@/lib/scoring/signals';

/**
 * Zet gedetecteerde signalen om in regels die op een gedrukte flyer mogen.
 *
 * Dit is het gevoeligste stuk van de applicatie. Deze zinnen gaan gedrukt bij
 * iemand door de brievenbus, met zijn bedrijfsnaam erboven.
 *
 * Vier regels:
 *
 * 1. Alleen FEITEN. Gevolgtrekkingen en aanbevelingen komen er niet in.
 * 2. Alleen signalen waar we voldoende zeker van zijn.
 * 3. Elke zin beschrijft wat WIJ hebben waargenomen, niet wat waar is over het
 *    bedrijf. "Wij vonden geen aanvraagformulier" blijft kloppen ook als er een
 *    achter JavaScript zit; "u heeft geen aanvraagformulier" niet.
 * 4. Er moet minstens één BEZIT in staan naast een GEMIS.
 *
 * Die vierde regel is de belangrijkste en kwam er later bij. Een flyer die
 * alleen opsomt wat iemand mist, is een lijstje kritiek van een vreemde. Een
 * flyer die begint bij wat hij heeft opgebouwd — jaren aan tevreden klanten,
 * een reputatie, een lange staat van dienst — en pas dan laat zien waar dat
 * blijft liggen, gaat over zijn bedrijf en niet over onze checklist. "U heeft
 * geen website" is geen boodschap. "128 klanten gaven u een 4,6, en wie u
 * opzoekt vindt alleen een telefoonnummer" wel.
 */

const MIN_CONFIDENCE = 0.6;

/** Een waarneming is óf iets dat het bedrijf heeft, óf iets dat ontbreekt. */
export type ObservationKind = 'asset' | 'gap';

export type Observation = {
  key: string;
  kind: ObservationKind;
  title: string;
  body: string;
};

function signalValue(signals: Signal[], key: string): Signal | undefined {
  const signal = signals.find((s) => s.key === key);
  if (!signal) return undefined;
  if (signal.kind !== 'fact') return undefined;
  if (signal.confidence < MIN_CONFIDENCE) return undefined;
  return signal;
}

function lacks(signals: Signal[], key: string): boolean {
  return signalValue(signals, key)?.normalized === 0;
}

function formatRating(rating: number): string {
  return rating.toFixed(1).replace('.', ',');
}

/**
 * Wat het bedrijf heeft opgebouwd en nu niet benut. Hier begint de flyer, want
 * dit is het deel dat de ondernemer herkent als van hem.
 */
function assets(signals: Signal[], place: PlaceSummary): Observation[] {
  const found: Observation[] = [];

  const reviewCount = place.reviewCount ?? 0;
  const rating = place.rating;
  const noWebsite = lacks(signals, 'no_website_listed') || !place.websiteUri;

  // Twee drempels, want een klein bedrijf met acht reviews en een 4,8 heeft net
  // zo goed iets opgebouwd als een groot bedrijf met honderd en een 4,1. De
  // eerste versie eiste er twintig en liet daarmee precies de kleine
  // installatiebedrijven vallen waar het om gaat.
  const strongReputation =
    rating !== null && ((reviewCount >= 20 && rating >= 4.0) || (reviewCount >= 8 && rating >= 4.2));

  if (strongReputation && rating !== null && (noWebsite || lacks(signals, 'shows_reviews'))) {
    found.push({
      key: 'reputation_unused',
      kind: 'asset',
      title: `${reviewCount} klanten gaven u gemiddeld een ${formatRating(rating)}`,
      body: noWebsite
        ? 'Die waardering staat alleen op Google. Wie u opzoekt en twijfelt, vindt verder niets.'
        : 'Sterk cijfer. Op uw eigen site komt het alleen nergens terug, juist waar iemand staat te twijfelen.',
    });
  }

  const founded = signalValue(signals, 'founded_year');
  const foundedValue = founded?.value as { year?: number; ageYears?: number } | undefined;
  if (foundedValue?.year && (foundedValue.ageYears ?? 0) >= 10) {
    found.push({
      key: 'long_established',
      kind: 'asset',
      title: `U bestaat al ${foundedValue.ageYears} jaar`,
      body: 'Dat is een voorsprong die online nauwelijks te zien is, terwijl nieuwe klanten daar juist op letten.',
    });
  }

  return found;
}

/** Wat er ontbreekt. Dit staat nooit alleen op een flyer. */
function gaps(signals: Signal[]): Observation[] {
  const found: Observation[] = [];

  if (lacks(signals, 'no_website_listed')) {
    found.push({
      key: 'no_website_listed',
      kind: 'gap',
      title: 'Bij Google staat geen website bij uw bedrijf',
      body: 'Er is geen plek om iemand naartoe te sturen die meer wil weten.',
    });
  }

  if (lacks(signals, 'has_request_form')) {
    found.push({
      key: 'has_request_form',
      kind: 'gap',
      title: 'Wij vonden geen aanvraagformulier op uw site',
      body: "Wie 's avonds iets wil laten uitzoeken, kan alleen wachten tot er iemand opneemt.",
    });
  }

  if (lacks(signals, 'mobile_friendly')) {
    found.push({
      key: 'mobile_friendly',
      kind: 'gap',
      title: 'Op een telefoon schaalt de site niet mee',
      body: 'Terwijl de meeste bezoekers juist op een klein scherm kijken.',
    });
  }

  if (lacks(signals, 'https')) {
    found.push({
      key: 'https',
      kind: 'gap',
      title: 'De site gebruikt nog geen beveiligde verbinding',
      body: 'Browsers waarschuwen bezoekers daar tegenwoordig zichtbaar voor.',
    });
  }

  return found;
}

/** Bezit eerst, dan het gemis. Maximaal drie. */
export function observationsForFlyer(signals: Signal[], place: PlaceSummary): Observation[] {
  // Was de site onbereikbaar, dan weten we van de rest niets. Een flyer die
  // beweert dat iemands website plat lag terwijl het een storing van vijf
  // minuten was, is precies de fout die we niet willen maken.
  if (lacks(signals, 'site_reachable')) return [];

  const owned = assets(signals, place);
  const missing = gaps(signals);

  if (owned.length === 0 || missing.length === 0) return [];

  return [...owned.slice(0, 2), ...missing].slice(0, 3);
}

export function flyerReadiness(
  signals: Signal[],
  place: PlaceSummary,
): { ready: boolean; observations: Observation[]; reason?: string } {
  const analyzed = signals.some((s) => s.detectedBy === 'website_probe');
  if (!analyzed) {
    return {
      ready: false,
      observations: [],
      reason: 'Nog niet geanalyseerd — klik eerst op "Analyseer site".',
    };
  }

  if (lacks(signals, 'site_reachable')) {
    return {
      ready: false,
      observations: [],
      reason: 'De website was niet bereikbaar toen we keken; daar drukken we niets over.',
    };
  }

  const owned = assets(signals, place);
  const missing = gaps(signals);

  // Eerst kijken of er iets te melden valt. Is de site op orde, dan is dat de
  // nuttige uitkomst — niet "geen bezit gevonden", want dat klopt dan wel maar
  // zegt niets.
  if (missing.length === 0) {
    return {
      ready: false,
      observations: [],
      reason: 'Site is op orde — niets concreets om te benoemen. Gebruik de generieke flyer.',
    };
  }

  if (owned.length === 0) {
    const count = place.reviewCount ?? 0;
    const rating = place.rating;
    const reputation =
      rating === null
        ? 'geen rating'
        : `${count} reviews met een ${rating.toFixed(1).replace('.', ',')}`;
    const age = signalValue(signals, 'founded_year') ? '' : ', geen oprichtingsjaar op de site';

    return {
      ready: false,
      observations: [],
      reason:
        `Wel gemissen gevonden, maar niets dat dit bedrijf al heeft opgebouwd ` +
        `(${reputation}${age}). Een flyer die alleen opsomt wat er ontbreekt is kritiek ` +
        `van een vreemde — gebruik de generieke.`,
    };
  }

  return { ready: true, observations: observationsForFlyer(signals, place) };
}
