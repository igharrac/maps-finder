import type { PlaceSummary } from '@/lib/places/types';
import type { Signal } from '@/lib/scoring/signals';

/**
 * Zet waarnemingen om in KANSEN die op een flyer mogen.
 *
 * De toon is het belangrijkste aan dit bestand. De doelgroep bestaat uit
 * financieel gezonde bedrijven die niet digitaal gedreven zijn, vaak onzeker
 * over AI, en die niet goed weten waar ze moeten beginnen. Zo iemand een lijstje
 * sturen met wat er mis is aan zijn website werkt averechts, hoe feitelijk het
 * ook klopt.
 *
 * Daarom drie regels over taal:
 *
 * 1. Kansen benoemen, geen fouten. Niet "er staat geen aanvraagformulier" maar
 *    "aanvragen slimmer verwerken".
 * 2. Voorzichtig formuleren. "Hier lijkt mogelijk winst te behalen", nooit
 *    "jullie doen dit verkeerd".
 * 3. Geen jargon. Geen API, machine learning, pipelines of LLM.
 *
 * En drie regels over waarheid, die overeind blijven:
 *
 * - FACT is wat we daadwerkelijk hebben waargenomen.
 * - OPPORTUNITY is waar mogelijk een kans ligt.
 * - SUGGESTION is wat we zouden kunnen onderzoeken.
 *
 * Een aanname wordt nooit als feit gepresenteerd. Elke kans hieronder rust op
 * een waarneming (`groundedIn`); alleen de afsluitende AI-suggestie doet dat
 * niet, en die mag daarom nooit alleen staan.
 */

const MIN_CONFIDENCE = 0.6;

/** De zes thema's waarin een ondernemer zijn eigen bedrijf herkent. */
export type ThemeId =
  | 'slimmer_werken'
  | 'meer_grip'
  | 'meer_klanten'
  | 'betere_dienstverlening'
  | 'systemen_samen'
  | 'klaar_voor_ai';

export type Observation = {
  key: string;
  theme: ThemeId;
  /** Uitkomst in de taal van de ondernemer, geen dienst of techniek. */
  title: string;
  /** Voorzichtig geformuleerd: hier lijkt mogelijk iets te halen. */
  body: string;
  /**
   * De waarneming waar deze kans op rust. Leeg bij een algemene suggestie, en
   * die mag daarom nooit als enige op een flyer staan.
   */
  groundedIn: string | null;
};

function signalValue(signals: Signal[], key: string): Signal | undefined {
  const signal = signals.find((s) => s.key === key);
  if (!signal || signal.kind !== 'fact') return undefined;
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
 * Kansen die op een waarneming rusten, in volgorde van hoe herkenbaar ze zijn
 * voor een ondernemer. Aanvragen en klanten eerst; techniek nooit vooraan.
 */
function grounded(signals: Signal[], place: PlaceSummary): Observation[] {
  const found: Observation[] = [];
  const reviewCount = place.reviewCount ?? 0;
  const rating = place.rating;
  const noWebsite = lacks(signals, 'no_website_listed') || !place.websiteUri;

  if (lacks(signals, 'has_request_form')) {
    found.push({
      key: 'aanvragen',
      theme: 'slimmer_werken',
      title: 'Aanvragen slimmer binnenkrijgen en verwerken',
      body: 'Hier lijkt mogelijk winst te behalen in het eenvoudiger verzamelen en opvolgen van aanvragen, ook buiten werktijd.',
      groundedIn: 'Op de website vonden we geen plek om een aanvraag achter te laten.',
    });
  }

  if (noWebsite) {
    found.push({
      key: 'vindbaarheid',
      theme: 'meer_klanten',
      title: 'Beter vindbaar voor wie jullie zoekt',
      body: 'Wie jullie opzoekt komt nu vooral bij het adres en telefoonnummer uit. Daar valt mogelijk meer uit te halen.',
      groundedIn: 'Bij Google staat geen website bij dit bedrijf.',
    });
  } else if (lacks(signals, 'shows_reviews') && reviewCount >= 8 && rating !== null && rating >= 4) {
    found.push({
      key: 'reputatie',
      theme: 'meer_klanten',
      title: 'Meer halen uit jullie goede naam',
      body: 'Die waardering kan mogelijk sterker meewerken op de plek waar iemand staat te twijfelen.',
      groundedIn: `${reviewCount} klanten gaven gemiddeld een ${formatRating(rating)} op Google.`,
    });
  }

  if (lacks(signals, 'mobile_friendly')) {
    found.push({
      key: 'mobiel',
      theme: 'betere_dienstverlening',
      title: 'Beter werken op een telefoon',
      body: 'De meeste mensen kijken op een klein scherm. Daar lijkt de ervaring nog eenvoudiger te kunnen.',
      groundedIn: 'De website is niet ingesteld op mobiele schermen.',
    });
  }

  if (lacks(signals, 'https')) {
    found.push({
      key: 'beveiliging',
      theme: 'betere_dienstverlening',
      title: 'Vertrouwd overkomen bij bezoekers',
      body: 'Browsers laten tegenwoordig zien of een verbinding beveiligd is. Dat is meestal snel geregeld.',
      groundedIn: 'De website gebruikt nog geen beveiligde verbinding.',
    });
  }

  return found;
}

/**
 * Afsluitende suggestie zonder eigen waarneming. Mag alleen mee als er al twee
 * onderbouwde kansen staan — anders zou een flyer volledig op een aanname rusten.
 */
const AI_SUGGESTION: Observation = {
  key: 'ai_praktisch',
  theme: 'klaar_voor_ai',
  title: 'Praktisch starten met AI',
  body: 'Terugkerend administratief werk kan tegenwoordig vaak gedeeltelijk slimmer. Klein beginnen, kijken wat het oplevert.',
  groundedIn: null,
};

export function observationsForFlyer(signals: Signal[], place: PlaceSummary): Observation[] {
  // Was de site onbereikbaar, dan weten we van de rest niets.
  if (lacks(signals, 'site_reachable')) return [];

  const real = grounded(signals, place);
  if (real.length < 2) return [];

  return real.length >= 3 ? real.slice(0, 3) : [...real, AI_SUGGESTION];
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
      reason: 'De website was niet bereikbaar toen we keken; daar baseren we geen kansen op.',
    };
  }

  const real = grounded(signals, place);

  if (real.length === 0) {
    return {
      ready: false,
      observations: [],
      reason: 'Niets concreets gevonden om een kans op te baseren. Gebruik de generieke flyer.',
    };
  }

  if (real.length === 1) {
    return {
      ready: false,
      observations: [],
      reason: `Maar één kans gevonden ("${real[0].title}"). Te mager voor een eigen flyer; gebruik de generieke.`,
    };
  }

  return { ready: true, observations: observationsForFlyer(signals, place) };
}
