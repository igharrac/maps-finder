/**
 * Herkent een pagina die zijn inhoud pas met JavaScript opbouwt.
 *
 * Dit is geen randgeval meer. Een moderne dakdekker laat zijn site bouwen in
 * React of Next.js, en dan staat er in de ruwe HTML niets anders dan een leeg
 * <div> en een berg scripts. Wij halen die HTML op, zien geen telefoonnummer,
 * geen aanvraagformulier en geen reviews — en zouden dat vastleggen als feiten
 * over dat bedrijf.
 *
 * Dat is precies de fout die eerder bij een geweigerd verzoek gemaakt werd:
 * iets over ONZE waarneming opschrijven alsof het iets over HUN bedrijf is.
 * Alleen is deze erger, want er komt geen foutmelding bij. De site doet het
 * prima, wij kijken alleen naar de verkeerde laag.
 *
 * Bij twijfel zeggen we dat het een shell is. Een gemiste analyse kost een
 * klik; een verzonnen bevinding kost geloofwaardigheid aan de deur.
 */

/** Onder dit aantal zichtbare tekens is er niets te lezen op de pagina. */
const MIN_ZICHTBARE_TEKST = 600;

/** Wortelelementen van de bekende frameworks. */
const WORTELS = [
  /<div[^>]+id=["'](?:root|app|__next|__nuxt|q-app)["'][^>]*>\s*<\/div>/i,
  /<div[^>]+id=["']root["'][^>]*>\s*$/i,
];

/** Haalt de leesbare tekst uit de HTML: zonder script, style, noscript en tags. */
export function zichtbareTekst(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template\b[\s\S]*?<\/template>/gi, ' ')
    .replace(/<head\b[\s\S]*?<\/head>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function looksClientRendered(html: string): boolean {
  if (!html) return false;

  const tekst = zichtbareTekst(html);

  // Een leeg wortelelement is het duidelijkste bewijs: daar hóórt de pagina in.
  if (WORTELS.some((patroon) => patroon.test(html))) return true;

  // Anders: veel scripts, weinig te lezen. Een echte pagina van 40 kB HTML met
  // maar 200 tekens tekst bestaat niet.
  const scripts = (html.match(/<script\b/gi) ?? []).length;
  return tekst.length < MIN_ZICHTBARE_TEKST && scripts >= 3;
}
