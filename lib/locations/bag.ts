/**
 * Wat voor pand staat er op dit adres?
 *
 * Google weet niet of een bedrijf op een bedrijventerrein staat of in de
 * voorkamer van een rijtjeshuis. De BAG weet dat wel: elk verblijfsobject
 * heeft een gebruiksdoel — woonfunctie, industriefunctie, kantoorfunctie,
 * winkelfunctie. Dat is open data van het Kadaster, via PDOK te bevragen
 * zonder sleutel en zonder quotum. Deze lookups kosten dus niets en tellen
 * niet mee in het Places-budget.
 *
 * Let op wat dit WEL en NIET zegt. Dit is een feit over het PAND, niet over
 * het bedrijf. Een timmerman die vanuit huis werkt is geen slechter bedrijf;
 * hij is alleen niet wie je aan de deur wilt. Deze module labelt daarom, en
 * oordeelt niet. De BAG kan er ook naast zitten: een bedrijfsruimte achter
 * een woonhuis staat soms nog als woonfunctie geregistreerd. Daarom is de
 * uitkomst in de app een filter dat je uit kunt zetten, geen harde zeef.
 */

const ENDPOINT = 'https://api.pdok.nl/kadaster/bag/ogc/v2/collections/verblijfsobject/items';

/** Hoe ver om het Google-punt heen we panden ophalen. */
const SEARCH_RADIUS_M = 60;

/** Verder dan dit noemen we het geen match meer. */
const MATCH_RADIUS_M = 70;

const REQUEST_TIMEOUT_MS = 5_000;

/** Hoeveel lookups tegelijk. PDOK kent geen quotum maar wel fair use. */
const CONCURRENCY = 6;

export type PandFunctie =
  /** Uitsluitend woonfunctie: bedrijf aan huis. */
  | 'woonadres'
  /** Woonfunctie plus iets bedrijfsmatigs in hetzelfde object. */
  | 'gemengd'
  /** Winkel, horeca, bijeenkomst: publiek pand, geen woning. */
  | 'winkel_of_horeca'
  /** Industrie, kantoor, opslag, overige gebruiksfunctie. */
  | 'bedrijfspand'
  /** Geen verblijfsobject gevonden, of de BAG weet het niet. */
  | 'onbekend';

export type LocationContext = {
  functie: PandFunctie;
  /** De ruwe gebruiksdoelen zoals de BAG ze teruggeeft. */
  gebruiksdoelen: string[];
  /** Het adres van het gevonden pand, zodat je kunt controleren of het klopt. */
  bagAdres: string | null;
  /** Oppervlakte van het verblijfsobject in m², als de BAG die kent. */
  oppervlakte: number | null;
  /** Afstand tussen het Google-punt en het gevonden pand, in meters. */
  afstandMeters: number | null;
  /** Waarom er niets te zeggen viel. Alleen gevuld bij 'onbekend'. */
  reden: string | null;
};

export const ONBEKEND: LocationContext = {
  functie: 'onbekend',
  gebruiksdoelen: [],
  bagAdres: null,
  oppervlakte: null,
  afstandMeters: null,
  reden: null,
};

export const PAND_FUNCTIE_LABEL: Record<PandFunctie, string> = {
  woonadres: 'Woonadres',
  gemengd: 'Wonen en werken',
  winkel_of_horeca: 'Winkel of horeca',
  bedrijfspand: 'Bedrijfspand',
  onbekend: 'Pand onbekend',
};

/** Gebruiksdoelen die op bedrijvigheid wijzen. */
const BEDRIJFSMATIG = new Set([
  'industriefunctie',
  'kantoorfunctie',
  'overige gebruiksfunctie',
  'sportfunctie',
  'onderwijsfunctie',
  'gezondheidszorgfunctie',
  'celfunctie',
]);

/** Publieksfuncties: wel een echte vestiging, geen bedrijventerrein. */
const PUBLIEK = new Set(['winkelfunctie', 'bijeenkomstfunctie', 'logiesfunctie']);

/** Objecten die niet (meer) bestaan tellen niet mee. */
function isActief(status: unknown): boolean {
  if (typeof status !== 'string') return true;
  const s = status.toLowerCase();
  return !s.includes('ingetrokken') && !s.includes('niet gerealiseerd') && !s.includes('buiten gebruik');
}

export function classificeer(gebruiksdoelen: string[]): PandFunctie {
  if (gebruiksdoelen.length === 0) return 'onbekend';

  const woon = gebruiksdoelen.includes('woonfunctie');
  const werk = gebruiksdoelen.some((d) => BEDRIJFSMATIG.has(d));
  const publiek = gebruiksdoelen.some((d) => PUBLIEK.has(d));

  if (woon && (werk || publiek)) return 'gemengd';
  if (woon) return 'woonadres';
  if (werk) return 'bedrijfspand';
  if (publiek) return 'winkel_of_horeca';
  return 'onbekend';
}

/** Meters tussen twee coördinaten (haversine). */
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Haalt postcode en huisnummer uit het adres dat Google meestuurt.
 *
 * "Industrieweg 12 A, 1521 NE Wormerveer, Nederland" levert 12, "A", 1521NE.
 * Lukt het niet, dan valt de lookup terug op het dichtstbijzijnde pand — dat
 * is minder precies, dus dit is de moeite waard.
 */
export function parseAdres(address: string | null): {
  huisnummer: number | null;
  huisletter: string | null;
  postcode: string | null;
} {
  if (!address) return { huisnummer: null, huisletter: null, postcode: null };

  const postcodeMatch = address.match(/\b(\d{4})\s?([A-Za-z]{2})\b/);
  const postcode = postcodeMatch
    ? `${postcodeMatch[1]}${postcodeMatch[2].toUpperCase()}`
    : null;

  // Het huisnummer staat in het eerste deel, achter de straatnaam.
  const straatdeel = address.split(',')[0] ?? '';
  const nummerMatch = straatdeel.match(/\s(\d+)\s*([A-Za-z])?\s*$/);

  return {
    huisnummer: nummerMatch ? Number(nummerMatch[1]) : null,
    huisletter: nummerMatch?.[2] ? nummerMatch[2].toUpperCase() : null,
    postcode,
  };
}

type Feature = {
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown };
};

/** De BAG kan meerdere gebruiksdoelen per object hebben; die komen niet altijd als lijst. */
function leesGebruiksdoelen(raw: unknown): string[] {
  const waarden = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  return waarden
    .map((v) => String(v).trim().toLowerCase())
    .filter((v) => v.length > 0);
}

function leesPunt(geometry: Feature['geometry']): { lat: number; lng: number } | null {
  const coords = geometry?.coordinates;
  // GeoJSON van PDOK staat in CRS84: lengtegraad eerst.
  if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
    return null;
  }
  return { lng: coords[0], lat: coords[1] };
}

function formatteerAdres(props: Record<string, unknown>): string | null {
  const straat = props.openbare_ruimte_naam;
  const nummer = props.huisnummer;
  if (typeof straat !== 'string' || nummer === null || nummer === undefined) return null;

  const letter = typeof props.huisletter === 'string' ? props.huisletter : '';
  const toevoeging = typeof props.toevoeging === 'string' ? `-${props.toevoeging}` : '';
  const plaats = typeof props.woonplaats_naam === 'string' ? `, ${props.woonplaats_naam}` : '';

  return `${straat} ${nummer}${letter}${toevoeging}${plaats}`;
}

/**
 * Zoekt het verblijfsobject dat bij dit bedrijf hoort.
 *
 * Eerst op huisnummer en postcode uit het Google-adres — dat is exact, en het
 * verschil telt: in een pand met woningen boven en een bedrijfsruimte beneden
 * is het dichtstbijzijnde object vaak de verkeerde. Lukt dat niet, dan het
 * dichtstbijzijnde actieve object binnen MATCH_RADIUS_M.
 */
function kiesObject(
  features: Feature[],
  punt: { lat: number; lng: number },
  adres: ReturnType<typeof parseAdres>,
): { props: Record<string, unknown>; afstand: number } | null {
  const kandidaten = features
    .map((f) => {
      const props = f.properties ?? {};
      const positie = leesPunt(f.geometry);
      return {
        props,
        afstand: positie ? distanceMeters(punt, positie) : Number.POSITIVE_INFINITY,
      };
    })
    .filter((k) => isActief(k.props.status))
    .sort((a, b) => a.afstand - b.afstand);

  if (kandidaten.length === 0) return null;

  if (adres.huisnummer !== null) {
    const opAdres = kandidaten.filter((k) => Number(k.props.huisnummer) === adres.huisnummer);
    const metPostcode = adres.postcode
      ? opAdres.filter(
          (k) =>
            typeof k.props.postcode === 'string' &&
            k.props.postcode.replace(/\s/g, '').toUpperCase() === adres.postcode,
        )
      : [];

    const exact = metPostcode.length > 0 ? metPostcode : opAdres;
    if (adres.huisletter) {
      const metLetter = exact.filter(
        (k) =>
          typeof k.props.huisletter === 'string' &&
          k.props.huisletter.toUpperCase() === adres.huisletter,
      );
      if (metLetter.length > 0) return metLetter[0];
    }
    if (exact.length > 0) return exact[0];
  }

  const dichtstbij = kandidaten[0];
  return dichtstbij.afstand <= MATCH_RADIUS_M ? dichtstbij : null;
}

/** Bouwt een bbox van ongeveer SEARCH_RADIUS_M om een punt heen. */
function bbox(lat: number, lng: number): string {
  const dLat = SEARCH_RADIUS_M / 111_320;
  const dLng = SEARCH_RADIUS_M / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((n) => n.toFixed(6)).join(',');
}

/** Eén bedrijf opzoeken. Faalt nooit hard: onbekend is een geldig antwoord. */
export async function lookupPand(place: {
  lat: number;
  lng: number;
  address: string | null;
}): Promise<LocationContext> {
  const url = `${ENDPOINT}?f=json&limit=100&bbox=${bbox(place.lat, place.lng)}`;

  let payload: { features?: Feature[] };
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/geo+json,application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ...ONBEKEND, reden: `BAG gaf status ${response.status}` };
    }
    payload = await response.json();
  } catch {
    return { ...ONBEKEND, reden: 'BAG was niet bereikbaar' };
  }

  const features = Array.isArray(payload.features) ? payload.features : [];
  if (features.length === 0) {
    return { ...ONBEKEND, reden: 'Geen pand gevonden op deze locatie' };
  }

  const gekozen = kiesObject(features, place, parseAdres(place.address));
  if (!gekozen) {
    return { ...ONBEKEND, reden: 'Geen pand dat bij dit adres past' };
  }

  const gebruiksdoelen = leesGebruiksdoelen(gekozen.props.gebruiksdoel);
  const oppervlakte = Number(gekozen.props.oppervlakte);

  return {
    functie: classificeer(gebruiksdoelen),
    gebruiksdoelen,
    bagAdres: formatteerAdres(gekozen.props),
    oppervlakte: Number.isFinite(oppervlakte) && oppervlakte > 0 ? oppervlakte : null,
    afstandMeters: Number.isFinite(gekozen.afstand) ? gekozen.afstand : null,
    reden: null,
  };
}

/**
 * Zoekt een hele reeks bedrijven op, met een rem erop.
 *
 * Het resultaat is een Map op placeId. Wat niet lukt komt er als 'onbekend'
 * in; een trage BAG mag een zoekactie nooit tegenhouden.
 */
export async function lookupPanden(
  places: Array<{ placeId: string; lat: number; lng: number; address: string | null }>,
): Promise<Map<string, LocationContext>> {
  const uitkomst = new Map<string, LocationContext>();
  const wachtrij = [...places];

  async function werker() {
    for (;;) {
      const plek = wachtrij.shift();
      if (!plek) return;
      uitkomst.set(plek.placeId, await lookupPand(plek));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, places.length) }, () => werker()),
  );

  return uitkomst;
}
