import type { PlaceSummary } from '@/lib/places/types';
import type { ScoreBreakdown } from '@/lib/scoring';

export const PROSPECT_STATUSES = [
  'discovered',
  'saved',
  'analyzed',
  'high_potential',
  'flyer_planned',
  'flyer_delivered',
  'contacted',
  'responded',
  'meeting',
  'opportunity',
  'customer',
  'rejected',
] as const;

export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const STATUS_LABELS: Record<ProspectStatus, string> = {
  discovered: 'Nieuw',
  saved: 'Opgeslagen',
  analyzed: 'Geanalyseerd',
  high_potential: 'Hoog potentieel',
  flyer_planned: 'Flyer gepland',
  flyer_delivered: 'Flyer bezorgd',
  contacted: 'Benaderd',
  responded: 'Gereageerd',
  meeting: 'Afspraak',
  opportunity: 'Kans',
  customer: 'Klant',
  rejected: 'Afgewezen',
};

/**
 * Statussen die een eigen markervorm op de kaart krijgen. De overige statussen
 * vallen terug op de dichtstbijzijnde vorm hieronder.
 */
export type MarkerStyleKey =
  | 'new'
  | 'interesting'
  | 'high_potential'
  | 'flyer_planned'
  | 'flyer_delivered'
  | 'responded';

export function markerStyleFor(
  status: ProspectStatus,
  opportunityScore: number | null,
): MarkerStyleKey {
  switch (status) {
    case 'high_potential':
    case 'opportunity':
    case 'customer':
      return 'high_potential';
    case 'flyer_planned':
      return 'flyer_planned';
    case 'flyer_delivered':
    case 'contacted':
      return 'flyer_delivered';
    case 'responded':
    case 'meeting':
      return 'responded';
    case 'saved':
    case 'analyzed':
      return 'interesting';
    default:
      return opportunityScore !== null && opportunityScore >= 80
        ? 'high_potential'
        : opportunityScore !== null && opportunityScore >= 65
          ? 'interesting'
          : 'new';
  }
}

/** Wat de workspace per bedrijf toont: brondata plus onze eigen kennis. */
export type ProspectView = {
  /** Aanwezig zodra het bedrijf als prospect is opgeslagen. */
  prospectId: string | null;
  status: ProspectStatus;
  place: PlaceSummary;
  score: ScoreBreakdown;
  /** Afstand tot het zoekmiddelpunt in meters. */
  distanceMeters: number | null;
};

/** Wat /api/places/search teruggeeft. Gedeeld tussen route en client. */
export type SearchResult = {
  prospectId: string | null;
  status: ProspectStatus;
  markerStyle: MarkerStyleKey;
  place: PlaceSummary;
  score: ScoreBreakdown;
  distanceMeters: number;
};

export type MarkerAppearance = {
  color: string;
  /** Vorm draagt de betekenis mee, zodat kleur niet het enige onderscheid is. */
  shape: 'circle' | 'ring' | 'diamond' | 'square' | 'check' | 'bubble';
  label: string;
};

/**
 * Volgorde van de legenda, en daarmee de sorteervolgorde op status: van
 * onbekeken naar wie al gereageerd heeft.
 */
export const MARKER_ORDER: MarkerStyleKey[] = [
  'new',
  'interesting',
  'high_potential',
  'flyer_planned',
  'flyer_delivered',
  'responded',
];

export const SORT_OPTIONS = [
  { id: 'score', label: 'Opportunity Score' },
  { id: 'status', label: 'Status (legenda)' },
  { id: 'distance', label: 'Afstand' },
  { id: 'reviews', label: 'Aantal reviews' },
  { id: 'rating', label: 'Rating' },
] as const;

export type SortId = (typeof SORT_OPTIONS)[number]['id'];

export const MARKER_APPEARANCE: Record<MarkerStyleKey, MarkerAppearance> = {
  new: { color: '#9A9389', shape: 'circle', label: 'Nieuw' },
  interesting: { color: '#B7791F', shape: 'ring', label: 'Interessant' },
  high_potential: { color: '#14594A', shape: 'diamond', label: 'Hoog potentieel' },
  flyer_planned: { color: '#2F5D8C', shape: 'square', label: 'Flyer gepland' },
  flyer_delivered: { color: '#6E7B85', shape: 'check', label: 'Flyer bezorgd' },
  responded: { color: '#C2410C', shape: 'bubble', label: 'Gereageerd' },
};
