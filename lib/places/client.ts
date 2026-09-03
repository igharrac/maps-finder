import { serverEnv } from '@/lib/env';
import type { AreaResolution, PlaceSummary, PlacesSearchResult } from './types';

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/places/client mag alleen op de server draaien — de Places-sleutel hoort nooit in de browser.',
  );
}

const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';
const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

/**
 * Veldmasker voor de ontdekfase. Bewust kort gehouden: elk extra veld kan het
 * verzoek naar een duurdere prijsklasse tillen. Rijkere details halen we pas op
 * wanneer een prospect daadwerkelijk geopend of opgeslagen wordt.
 *
 * id/displayName/formattedAddress/location vallen onder Essentials; rating,
 * userRatingCount en websiteUri tillen het verzoek naar Pro. Die drie hebben we
 * nodig om te kunnen filteren, dus dat is een bewuste afweging.
 */
const DISCOVERY_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.businessStatus',
].join(',');

/** Google levert maximaal 20 resultaten per verzoek. */
export const MAX_RESULTS_PER_REQUEST = 20;

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  businessStatus?: string;
};

export class PlacesError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PlacesError';
  }
}

function toSummary(raw: RawPlace): PlaceSummary | null {
  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
  if (!raw.id || lat === undefined || lng === undefined) return null;

  return {
    placeId: raw.id,
    name: raw.displayName?.text ?? 'Naam onbekend',
    address: raw.formattedAddress ?? null,
    lat,
    lng,
    primaryType: raw.primaryType ?? null,
    categoryLabel: raw.primaryTypeDisplayName?.text ?? null,
    rating: raw.rating ?? null,
    reviewCount: raw.userRatingCount ?? null,
    websiteUri: raw.websiteUri ?? null,
    businessStatus: raw.businessStatus ?? null,
    groupIds: [],
  };
}

/**
 * Zoekt bedrijven binnen een straal. Eén verzoek levert maximaal 20 resultaten;
 * een gebied afdekken vraagt dus om meerdere aanroepen met verschillende
 * middelpunten. Dat gebeurt bewust NIET automatisch — de gebruiker start elke
 * zoekactie zelf, zodat pannen en zoomen geen kosten veroorzaakt.
 */
/** Haalt de afgewezen types uit een INVALID_ARGUMENT-melding van Google. */
function parseUnsupportedTypes(detail: string): string[] {
  const match = /Unsupported types:\s*([^"\\}]+)/i.exec(detail);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((t) => t.trim().replace(/[.\s]+$/, ''))
    .filter(Boolean);
}

async function callSearchNearby(
  key: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; places: RawPlace[] } | { ok: false; status: number; detail: string }> {
  const response = await fetch(PLACES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': DISCOVERY_FIELD_MASK,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    return { ok: false, status: response.status, detail: await response.text() };
  }

  const data = (await response.json()) as { places?: RawPlace[] };
  return { ok: true, places: data.places ?? [] };
}

/**
 * Zoekt bedrijven binnen een straal. Eén verzoek levert maximaal 20 resultaten;
 * een gebied afdekken vraagt dus om meerdere aanroepen met verschillende
 * middelpunten. Dat gebeurt bewust NIET automatisch — de gebruiker start elke
 * zoekactie zelf, zodat pannen en zoomen geen kosten veroorzaakt.
 *
 * Weigert Google een branchetype, dan laten we de zoekactie niet klappen: het
 * type gaat eruit en het verzoek wordt één keer opnieuw gedaan, met een melding
 * erbij. Een verkeerd type in de configuratie mag nooit een lege kaart opleveren.
 */
export async function searchNearby(params: {
  lat: number;
  lng: number;
  radiusMeters: number;
  includedTypes?: string[];
}): Promise<PlacesSearchResult> {
  const { placesKey } = serverEnv();
  const warnings: string[] = [];
  let requestCount = 0;

  const buildBody = (types?: string[]): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      maxResultCount: MAX_RESULTS_PER_REQUEST,
      // DISTANCE en niet POPULARITY: voor het uitkammen van een gebied wil je
      // alles wat er dichtbij zit, niet de twintig bekendste zaken in de wijde
      // omtrek. Bij POPULARITY verdringen supermarkten en ketens precies de
      // kleine bedrijven waar het om gaat.
      rankPreference: 'DISTANCE',
      languageCode: 'nl',
      regionCode: 'NL',
      locationRestriction: {
        circle: {
          center: { latitude: params.lat, longitude: params.lng },
          // Google accepteert maximaal 50 km.
          radius: Math.min(Math.max(params.radiusMeters, 1), 50_000),
        },
      },
    };
    if (types?.length) body.includedTypes = types;
    return body;
  };

  let types = params.includedTypes?.length ? [...params.includedTypes] : undefined;

  requestCount += 1;
  let result = await callSearchNearby(placesKey, buildBody(types));

  if (!result.ok && result.status === 400 && types) {
    const unsupported = parseUnsupportedTypes(result.detail);
    const remaining = types.filter((t) => !unsupported.includes(t));

    if (unsupported.length && remaining.length < types.length) {
      warnings.push(
        `Google accepteert ${unsupported.join(', ')} niet als zoektype; deze zijn overgeslagen.`,
      );
      types = remaining.length ? remaining : undefined;
      requestCount += 1;
      result = await callSearchNearby(placesKey, buildBody(types));
    }
  }

  if (!result.ok) {
    throw new PlacesError(
      `Places API gaf ${result.status}: ${result.detail.slice(0, 400)}`,
      result.status,
    );
  }

  const places = result.places
    .map(toSummary)
    .filter((p): p is PlaceSummary => p !== null);

  return { places, requestCount, warnings };
}

/**
 * Zet een postcode, plaatsnaam of adres om naar coördinaten.
 * Vereist dat de Geocoding API aanstaat in Google Cloud Console.
 */
export async function resolveArea(query: string): Promise<AreaResolution | null> {
  const { placesKey } = serverEnv();

  const url = new URL(GEOCODE_ENDPOINT);
  url.searchParams.set('address', query);
  url.searchParams.set('region', 'nl');
  url.searchParams.set('language', 'nl');
  url.searchParams.set('key', placesKey);

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new PlacesError(`Geocoding API gaf ${response.status}`, response.status);
  }

  const data = (await response.json()) as {
    status?: string;
    error_message?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };

  if (data.status === 'ZERO_RESULTS') return null;
  if (data.status !== 'OK') {
    throw new PlacesError(
      data.error_message ?? `Geocoding gaf status ${data.status}`,
      502,
    );
  }

  const first = data.results?.[0];
  const lat = first?.geometry?.location?.lat;
  const lng = first?.geometry?.location?.lng;
  if (lat === undefined || lng === undefined) return null;

  return { label: first?.formatted_address ?? query, lat, lng };
}

export type SearchGroup = { id: string; types: string[] };

/**
 * Zoekt per branchegroep apart en voegt de resultaten samen.
 *
 * Dit is de kern van waarom één verzoek met alle types niet werkt. Google geeft
 * maximaal twintig resultaten per verzoek terug. Gooi je achttien types in één
 * verzoek, dan vullen die twintig plekken zich met wat er het dichtst bij ligt
 * over ALLE types heen — en dan verdringen kappers, supermarkten en cafés de
 * installatiebedrijven waar je voor kwam. Meer aanvinken gaf dus minder van wat
 * je zocht. Precies het tegenovergestelde van de bedoeling.
 *
 * Nu krijgt elke groep zijn eigen twintig plekken. Zes groepen aangevinkt is zes
 * verzoeken en tot 120 resultaten, netjes verdeeld over de branches.
 *
 * De prijs is één Places-verzoek per aangevinkte groep in plaats van één in
 * totaal. Bij het gratis maandtegoed van 5.000 verzoeken is dat ruim voldoende,
 * en de teller op de kaart laat zien wat je verbruikt.
 */
export async function searchGroups(params: {
  lat: number;
  lng: number;
  radiusMeters: number;
  groups: SearchGroup[];
}): Promise<PlacesSearchResult> {
  if (params.groups.length === 0) {
    return searchNearby({ lat: params.lat, lng: params.lng, radiusMeters: params.radiusMeters });
  }

  const settled = await Promise.allSettled(
    params.groups.map((group) =>
      searchNearby({
        lat: params.lat,
        lng: params.lng,
        radiusMeters: params.radiusMeters,
        includedTypes: group.types,
      }).then((result) => ({ group, result })),
    ),
  );

  // Eén plek kan in meerdere groepen vallen; die houden we één keer, met alle
  // groepen erbij zodat de lijst kan laten zien waar hij vandaan komt.
  const merged = new Map<string, PlaceSummary>();
  const warnings: string[] = [];
  let requestCount = 0;

  for (const [index, outcome] of settled.entries()) {
    const group = params.groups[index];

    if (outcome.status === 'rejected') {
      requestCount += 1;
      warnings.push(
        `De branche "${group.id}" kon niet opgehaald worden; de rest is wel doorzocht.`,
      );
      continue;
    }

    requestCount += outcome.value.result.requestCount;
    warnings.push(...outcome.value.result.warnings);

    for (const place of outcome.value.result.places) {
      const existing = merged.get(place.placeId);
      if (existing) {
        if (!existing.groupIds.includes(group.id)) existing.groupIds.push(group.id);
      } else {
        merged.set(place.placeId, { ...place, groupIds: [group.id] });
      }
    }
  }

  if (merged.size === 0 && warnings.length === settled.length) {
    throw new PlacesError('Geen enkele branche kon opgehaald worden.', 502);
  }

  return { places: [...merged.values()], requestCount, warnings: [...new Set(warnings)] };
}
