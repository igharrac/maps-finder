import type { Signal } from '@/lib/scoring/signals';

/**
 * Detecteert signalen in de HTML van een bedrijfswebsite.
 *
 * Alles hier is bewust een WAARNEMING, geen oordeel. "Geen offerteformulier
 * gevonden" is een feit over wat wij aantroffen; of dat betekent dat offertes
 * handmatig verwerkt worden is een aanname, en die hoort in de kansenlaag —
 * niet hier.
 *
 * De detectie is opzettelijk conservatief: bij twijfel geen signaal in plaats
 * van een signaal dat er misschien naast zit. Een verkeerd feit op een
 * gepersonaliseerde flyer is schadelijker dan een ontbrekend feit.
 */

export type PageInput = {
  url: string;
  status: number;
  html: string;
  headers: Record<string, string>;
  /** Duur van het ophalen in milliseconden. */
  elapsedMs: number;
};

const FORM_KEYWORDS = [
  'offerte',
  'aanvraag',
  'aanvragen',
  'afspraak',
  'afspraak maken',
  'contactformulier',
  'vrijblijvend',
  'plan een',
  'boek een',
  'reserveer',
];

const REVIEW_MARKERS = [
  'google review',
  'reviews',
  'beoordeling',
  'klantbeoordeling',
  'wat klanten zeggen',
  'trustpilot',
  'kiyoh',
  'klantenvertellen',
];

/**
 * Oprichtingsjaar staat nergens in Google Places — dat veld bestaat daar niet.
 * Het enige wat we kunnen doen is kijken of het bedrijf het zelf op zijn site
 * zet, en dat doen Nederlandse MKB-bedrijven verrassend vaak: "sinds 1987",
 * "al ruim 40 jaar". Dat is zelfgerapporteerd en dus geen registergegeven; de
 * zekerheid blijft navenant bescheiden.
 */
const FOUNDED_YEAR_PATTERNS = [
  /(?:sinds|since|opgericht\s+in|gestart\s+in|bestaat\s+sinds|actief\s+sinds)\s*:?\s*(1[89]\d{2}|20[0-4]\d)/i,
];

const FOUNDED_AGE_PATTERNS = [
  /al\s+(?:ruim\s+|meer\s+dan\s+|bijna\s+)?(\d{1,3})\s*jaar/i,
  /(\d{1,3})\s*jaar\s+(?:ervaring|actief|vakmanschap)/i,
];

const CMS_FINGERPRINTS: Array<[RegExp, string]> = [
  [/wp-content|wp-includes|wordpress/i, 'WordPress'],
  [/cdn\.shopify\.com|shopify/i, 'Shopify'],
  [/wix\.com|wixstatic/i, 'Wix'],
  [/squarespace/i, 'Squarespace'],
  [/joomla/i, 'Joomla'],
  [/drupal/i, 'Drupal'],
  [/webflow/i, 'Webflow'],
  [/jouwweb|mijnwebwinkel/i, 'JouwWeb'],
];

function fact(
  key: string,
  label: string,
  value: unknown,
  normalized: number | null,
  confidence = 1,
): Signal {
  return { key, kind: 'fact', label, value, normalized, confidence, detectedBy: 'website_probe' };
}

/** Verwijdert script- en style-inhoud zodat keywords niet in code gevonden worden. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase();
}

export function detectSignals(page: PageInput): Signal[] {
  const signals: Signal[] = [];
  const html = page.html;
  const lower = html.toLowerCase();
  const text = visibleText(html);

  // --- bereikbaarheid ------------------------------------------------------
  const reachable = page.status >= 200 && page.status < 400;
  signals.push(
    fact(
      'site_reachable',
      reachable ? 'Website is bereikbaar' : `Website gaf statuscode ${page.status}`,
      { status: page.status },
      reachable ? 1 : 0,
    ),
  );

  if (!reachable) return signals;

  // --- beveiligde verbinding ----------------------------------------------
  const https = page.url.startsWith('https://');
  signals.push(
    fact(
      'https',
      https ? 'Verbinding is beveiligd (https)' : 'Geen beveiligde verbinding (alleen http)',
      { url: page.url },
      https ? 1 : 0,
    ),
  );

  // --- mobiele weergave ----------------------------------------------------
  const hasViewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html);
  signals.push(
    fact(
      'mobile_friendly',
      hasViewport
        ? 'Site is ingesteld op mobiele schermen'
        : 'Geen mobiele weergave — site schaalt niet op een telefoon',
      { hasViewport },
      hasViewport ? 1 : 0,
    ),
  );

  // --- aanvraag- of offerteformulier ---------------------------------------
  const formCount = (lower.match(/<form[\s>]/g) ?? []).length;
  const matchedKeyword = FORM_KEYWORDS.find((kw) => text.includes(kw)) ?? null;
  // Een <form> alleen is niet genoeg: dat is vaak een zoekveld of nieuwsbrief.
  // Pas in combinatie met een aanvraagwoord noemen we het een aanvraagflow.
  const hasRequestForm = formCount > 0 && matchedKeyword !== null;

  signals.push(
    fact(
      'has_request_form',
      hasRequestForm
        ? 'Aanvraag- of offerteformulier aangetroffen'
        : 'Geen aanvraag- of offerteformulier gevonden',
      { formCount, matchedKeyword },
      hasRequestForm ? 1 : 0,
      // Formulieren die pas na JavaScript verschijnen zien we niet.
      hasRequestForm ? 0.9 : 0.65,
    ),
  );

  // --- reviews op de eigen site --------------------------------------------
  const reviewMarker = REVIEW_MARKERS.find((m) => text.includes(m)) ?? null;
  signals.push(
    fact(
      'shows_reviews',
      reviewMarker
        ? 'Reviews of beoordelingen staan op de site'
        : 'Reviews worden nergens op de site getoond',
      { marker: reviewMarker },
      reviewMarker ? 1 : 0,
      0.7,
    ),
  );

  // --- hoe recent -----------------------------------------------------------
  const yearMatches = [...html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,12}(20\d{2})/gi)].map((m) =>
    Number(m[1]),
  );
  const lastModified = page.headers['last-modified'];
  const currentYear = new Date().getFullYear();

  let freshnessYear: number | null = yearMatches.length ? Math.max(...yearMatches) : null;
  if (!freshnessYear && lastModified) {
    const parsed = new Date(lastModified);
    if (!Number.isNaN(parsed.getTime())) freshnessYear = parsed.getFullYear();
  }

  if (freshnessYear) {
    const age = currentYear - freshnessYear;
    signals.push(
      fact(
        'recently_updated',
        age <= 1
          ? `Site lijkt actueel (${freshnessYear})`
          : `Laatste zichtbare jaartal is ${freshnessYear}`,
        { year: freshnessYear, ageYears: age },
        Math.max(0, 1 - age / 6),
        // Een copyrightjaartal is een zwakke indicator; vaak staat het vast.
        0.55,
      ),
    );
  }

  // --- hoe lang bestaat het bedrijf ----------------------------------------
  const currentYearNow = new Date().getFullYear();
  let founded: number | null = null;

  for (const pattern of FOUNDED_YEAR_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const year = Number(match[1]);
      if (year >= 1850 && year <= currentYearNow) {
        founded = year;
        break;
      }
    }
  }

  if (founded === null) {
    for (const pattern of FOUNDED_AGE_PATTERNS) {
      const match = pattern.exec(text);
      if (match) {
        const years = Number(match[1]);
        if (years >= 1 && years <= 200) {
          founded = currentYearNow - years;
          break;
        }
      }
    }
  }

  if (founded !== null) {
    const age = currentYearNow - founded;
    signals.push(
      fact(
        'founded_year',
        age <= 3
          ? `Bestaat sinds ${founded} — nog geen ${age + 1} jaar`
          : `Bestaat sinds ${founded} — ${age} jaar actief`,
        { year: founded, ageYears: age, young: age <= 3, established: age >= 20 },
        null,
        // Zelfgerapporteerd en uit lopende tekst gehaald; goed genoeg om te
        // tonen, niet om een score op te bouwen.
        0.6,
      ),
    );
  }

  // --- techniek -------------------------------------------------------------
  const cms = CMS_FINGERPRINTS.find(([re]) => re.test(html))?.[1] ?? null;
  if (cms) {
    signals.push(fact('cms', `Gebouwd met ${cms}`, { cms }, null, 0.85));
  }

  // --- snelheid -------------------------------------------------------------
  signals.push(
    fact(
      'load_time',
      page.elapsedMs > 3000
        ? `Homepage deed er ${(page.elapsedMs / 1000).toFixed(1).replace('.', ',')} seconde over`
        : 'Homepage laadt vlot',
      { elapsedMs: page.elapsedMs },
      null,
      // Eén meting vanaf één plek zegt weinig over de echte snelheid.
      0.4,
    ),
  );

  return signals;
}
