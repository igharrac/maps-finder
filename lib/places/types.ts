/**
 * Vorm waarin de rest van de applicatie een bedrijf ziet.
 *
 * Alles hierin komt van Google en is TIJDELIJK: het mag maximaal 30 dagen
 * bewaard worden (place_id uitgezonderd). Sla dit dus op in prospect_sources
 * met een expires_at, nooit als kolommen op prospects.
 */
export type PlaceSummary = {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  primaryType: string | null;
  categoryLabel: string | null;
  rating: number | null;
  reviewCount: number | null;
  websiteUri: string | null;
  businessStatus: string | null;
};

export type AreaResolution = {
  label: string;
  lat: number;
  lng: number;
};

export type PlacesSearchResult = {
  places: PlaceSummary[];
  /** Aantal Places-verzoeken dat deze zoekactie gekost heeft. */
  requestCount: number;
};
