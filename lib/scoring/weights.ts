/**
 * Alle wegingen op één plek. Niets van dit bestand hoort verspreid door de
 * applicatie te staan — een score moet altijd terug te rekenen zijn naar deze
 * getallen plus de opgeslagen signalen.
 */

export type ScoringWeights = {
  businessPotential: {
    reviewVolume: number;
    rating: number;
    categoryFit: number;
  };
  digitalMaturity: {
    hasWebsite: number;
    hasRequestForm: number;
    mobileFriendly: number;
    showsReviews: number;
    recentlyUpdated: number;
  };
  opportunity: {
    businessPotential: number;
    digitalGap: number;
  };
};

export const DEFAULT_WEIGHTS: ScoringWeights = {
  businessPotential: {
    reviewVolume: 0.45,
    rating: 0.2,
    categoryFit: 0.35,
  },
  // Deze vijf signalen komen uit de website-verrijking. Zolang die er niet is,
  // draagt alleen hasWebsite bij en is de score navenant onbetrouwbaar.
  digitalMaturity: {
    hasWebsite: 0.3,
    hasRequestForm: 0.25,
    mobileFriendly: 0.2,
    showsReviews: 0.15,
    recentlyUpdated: 0.1,
  },
  opportunity: {
    businessPotential: 0.6,
    digitalGap: 0.4,
  },
};

export const MODEL_VERSION = 'v1-google-only';

/**
 * Hoe goed een branche past bij het aanbod: automatisering, offerteprocessen,
 * UX en lokale marketing. Hoger betekent meer te winnen.
 * Onbekende types vallen terug op DEFAULT_CATEGORY_FIT.
 */
export const DEFAULT_CATEGORY_FIT = 0.5;

export const CATEGORY_FIT: Record<string, number> = {
  plumber: 0.95,
  electrician: 0.95,
  general_contractor: 0.9,
  roofing_contractor: 0.9,
  painter: 0.85,
  locksmith: 0.8,
  moving_company: 0.85,
  car_repair: 0.9,
  car_dealer: 0.75,
  storage: 0.7,
  lawyer: 0.8,
  accounting: 0.85,
  insurance_agency: 0.8,
  real_estate_agency: 0.8,
  dentist: 0.85,
  physiotherapist: 0.85,
  veterinary_care: 0.8,
  hair_salon: 0.6,
  beauty_salon: 0.6,
  restaurant: 0.4,
  cafe: 0.35,
  bakery: 0.45,
  bar: 0.3,
  gym: 0.65,
  florist: 0.5,
};
