import type { Signal } from '@/lib/scoring/signals';
import type { PageInput } from './detectors';

/**
 * Haalt contactgegevens uit de website die we toch al ophalen.
 *
 * Waarvoor dit WEL is: weten wie je aan de deur moet vragen, een nummer
 * hebben voor ná een gesprek of een QR-scan, en zien of dit bedrijf
 * überhaupt bereikbaar is. Dat laatste is trouwens zelf een waarneming — een
 * site zonder enige contactweg zegt iets.
 *
 * Waarvoor dit NIET is: ongevraagd mailen. Het Nederlandse spamverbod (art.
 * 11.7 Telecommunicatiewet) geldt ook zakelijk, en voor eenmanszaken en vof's
 * — een groot deel van deze doelgroep — geldt gewoon opt-in. Daarom staat
 * hier geen verzendfunctie en zal die er ook niet per ongeluk bij komen.
 *
 * Een adres als info@bedrijf.nl is een bedrijfsgegeven. Een adres als
 * jan@bedrijf.nl is een persoonsgegeven, met alles wat de AVG daaraan
 * verbindt. Die twee worden hier apart gehouden, zodat het verschil zichtbaar
 * blijft en niet in één hoop verdwijnt.
 */

export type EmailAdres = {
  adres: string;
  /** Een rolpostbus (info@, verkoop@) of het adres van een persoon. */
  soort: 'rol' | 'persoonlijk';
};

export type ContactDetails = {
  emails: EmailAdres[];
  telefoons: string[];
  contactpagina: string | null;
  kvk: string | null;
  btw: string | null;
  socials: string[];
};

export const LEEG: ContactDetails = {
  emails: [],
  telefoons: [],
  contactpagina: null,
  kvk: null,
  btw: null,
  socials: [],
};

/** Postbussen die bij een functie horen en niet bij een mens. */
const ROL_PREFIXEN = new Set([
  'info', 'contact', 'hello', 'hallo', 'mail', 'email', 'e-mail',
  'office', 'kantoor', 'admin', 'administratie', 'boekhouding',
  'facturatie', 'factuur', 'facturen', 'verkoop', 'sales', 'service',
  'support', 'helpdesk', 'klantenservice', 'planning', 'werkplaats',
  'receptie', 'secretariaat', 'balie', 'offerte', 'offertes', 'aanvraag',
  'noreply', 'no-reply', 'webmaster', 'marketing', 'pr', 'hr',
  'sollicitatie', 'vacature', 'werkenbij', 'post', 'algemeen',
]);

/**
 * Bestandsnamen als logo@2x.png zien er precies uit als een e-mailadres.
 * Een verkeerd adres is erger dan een ontbrekend adres, dus liever streng.
 */
const GEEN_TLD = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'css', 'js', 'json',
  'woff', 'woff2', 'ttf', 'eot', 'otf', 'mp4', 'webm', 'pdf', 'zip', 'map',
]);

/** Adressen van bouwers en trackers, niet van het bedrijf zelf. */
const RUIS = [
  'sentry.io', 'wixpress.com', 'example.com', 'example.org', 'domain.com',
  'yourdomain', 'jouwdomein', 'email.com', 'sentry-next', 'godaddy.com',
  'squarespace.com', 'wordpress.org', 'w3.org', 'schema.org',
];

const EMAIL_PATROON = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MAILTO_PATROON = /mailto:([^"'?\s>]+)/gi;
const TEL_PATROON = /tel:([+0-9(). \-]{6,})/gi;

function geldigEmail(kandidaat: string): boolean {
  const adres = kandidaat.toLowerCase().trim();
  if (adres.length > 100) return false;

  const [lokaal, domein] = adres.split('@');
  if (!lokaal || !domein) return false;

  const tld = domein.split('.').pop() ?? '';
  if (GEEN_TLD.has(tld)) return false;
  if (RUIS.some((r) => adres.includes(r))) return false;

  // logo@2x, icon@3x en dergelijke.
  if (/^\d+x$/.test(domein.split('.')[0] ?? '')) return false;
  if (/^[0-9]+$/.test(lokaal)) return false;

  return true;
}

function soortVan(adres: string): 'rol' | 'persoonlijk' {
  const lokaal = adres.split('@')[0] ?? '';
  const kern = lokaal.split(/[.+_-]/)[0] ?? lokaal;
  return ROL_PREFIXEN.has(lokaal) || ROL_PREFIXEN.has(kern) ? 'rol' : 'persoonlijk';
}

export function extractEmails(html: string): EmailAdres[] {
  const gevonden = new Set<string>();

  // mailto-links eerst: die zijn bedoeld als contactweg, niet toevallig.
  for (const match of html.matchAll(MAILTO_PATROON)) {
    const adres = decodeURIComponent(match[1]).toLowerCase().trim();
    if (geldigEmail(adres)) gevonden.add(adres);
  }

  for (const match of html.matchAll(EMAIL_PATROON)) {
    const adres = match[0].toLowerCase().trim();
    if (geldigEmail(adres)) gevonden.add(adres);
  }

  return [...gevonden]
    .slice(0, 6)
    .map((adres) => ({ adres, soort: soortVan(adres) }))
    // Rolpostbussen eerst: dat is het adres waar je in de praktijk bent.
    .sort((a, b) => (a.soort === b.soort ? 0 : a.soort === 'rol' ? -1 : 1));
}

/**
 * Nederlandse telefoonnummers. Bewust smal: alleen wat begint met 0 of +31 en
 * op tien cijfers uitkomt. Anders vist het patroon jaartallen, KvK-nummers en
 * huisnummers op.
 */
export function normaliseerTelefoon(ruw: string): string | null {
  let cijfers = ruw.replace(/[^\d+]/g, '');

  if (cijfers.startsWith('0031')) cijfers = `+31${cijfers.slice(4)}`;
  if (cijfers.startsWith('+310')) cijfers = `+31${cijfers.slice(4)}`;

  if (cijfers.startsWith('+31')) {
    const rest = cijfers.slice(3);
    return /^\d{9}$/.test(rest) ? `+31${rest}` : null;
  }

  if (/^0\d{9}$/.test(cijfers)) return cijfers;
  return null;
}

export function extractTelefoons(html: string): string[] {
  const gevonden = new Set<string>();

  for (const match of html.matchAll(TEL_PATROON)) {
    const nummer = normaliseerTelefoon(match[1]);
    if (nummer) gevonden.add(nummer);
  }

  const tekst = html.replace(/<[^>]+>/g, ' ');
  const patronen = [
    /\+31[\s\-()]*\(?0?\)?[\s\-]*\d[\d\s\-()]{7,12}/g,
    /\b0[1-9][\d\s\-()]{7,12}\b/g,
  ];

  for (const patroon of patronen) {
    for (const match of tekst.matchAll(patroon)) {
      const nummer = normaliseerTelefoon(match[0]);
      if (nummer) gevonden.add(nummer);
    }
  }

  return [...gevonden].slice(0, 4);
}

function absoluut(href: string, basis: string): string | null {
  try {
    return new URL(href, basis).toString();
  } catch {
    return null;
  }
}

export function extractContactpagina(html: string, basisUrl: string): string | null {
  const links = html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi);

  for (const link of links) {
    const href = link[1];
    const tekst = link[2].replace(/<[^>]+>/g, ' ').toLowerCase();
    if (href.startsWith('mailto:') || href.startsWith('tel:')) continue;

    if (/contact|offerte|afspraak/i.test(href) || /contact|offerte|afspraak/.test(tekst)) {
      const url = absoluut(href, basisUrl);
      if (url) return url;
    }
  }

  return null;
}

export function extractSocials(html: string): string[] {
  const gevonden = new Set<string>();
  const patroon =
    /https?:\/\/(?:www\.)?(linkedin\.com\/(?:company|in)\/[^"'\s<>]+|facebook\.com\/[^"'\s<>]+|instagram\.com\/[^"'\s<>]+)/gi;

  for (const match of html.matchAll(patroon)) {
    const url = match[0].replace(/[),.]+$/, '');
    if (url.length < 160) gevonden.add(url);
  }

  return [...gevonden].slice(0, 3);
}

export function extractContacts(page: PageInput): ContactDetails {
  if (!page.html) return LEEG;

  const kvk = page.html.match(/\bkvk[^0-9]{0,20}(\d{8})\b/i);
  const btw = page.html.match(/\bNL\s?\d{9}\s?B\s?\d{2}\b/i);

  return {
    emails: extractEmails(page.html),
    telefoons: extractTelefoons(page.html),
    contactpagina: extractContactpagina(page.html, page.url),
    kvk: kvk ? kvk[1] : null,
    btw: btw ? btw[0].replace(/\s/g, '').toUpperCase() : null,
    socials: extractSocials(page.html),
  };
}

/**
 * Verpakt de contactgegevens als signaal, zodat ze via het bestaande pad
 * worden opgeslagen.
 *
 * normalized is null: dit weegt niet mee in de score. Een bedrijf dat zijn
 * e-mailadres niet op de site zet is niet minder interessant, en een bedrijf
 * dat dat wel doet niet meer.
 */
export function contactSignals(page: PageInput): Signal[] {
  const contact = extractContacts(page);

  const aantalMails = contact.emails.length;
  const aantalNummers = contact.telefoons.length;
  if (aantalMails === 0 && aantalNummers === 0 && !contact.contactpagina) return [];

  const delen: string[] = [];
  if (aantalNummers > 0) delen.push(contact.telefoons[0]);
  if (aantalMails > 0) delen.push(contact.emails[0].adres);
  if (delen.length === 0 && contact.contactpagina) delen.push('alleen een contactformulier');

  return [
    {
      key: 'contact_details',
      kind: 'fact',
      label: `Contact: ${delen.join(' · ')}`,
      value: contact,
      normalized: null,
      confidence: 0.9,
      detectedBy: 'website_probe',
    },
  ];
}

/** Leest de contactgegevens terug uit een opgeslagen signaallijst. */
export function contactsFromSignals(
  signals: Array<{ key: string; value: unknown }>,
): ContactDetails | null {
  const signal = signals.find((s) => s.key === 'contact_details');
  if (!signal?.value || typeof signal.value !== 'object') return null;

  const waarde = signal.value as Partial<ContactDetails>;
  return {
    emails: Array.isArray(waarde.emails) ? waarde.emails : [],
    telefoons: Array.isArray(waarde.telefoons) ? waarde.telefoons : [],
    contactpagina: waarde.contactpagina ?? null,
    kvk: waarde.kvk ?? null,
    btw: waarde.btw ?? null,
    socials: Array.isArray(waarde.socials) ? waarde.socials : [],
  };
}
