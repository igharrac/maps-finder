import { chromium, type Browser } from 'playwright';

/**
 * Eén gedeelde Chromium voor de hele applicatie.
 *
 * Zowel het maken van de flyer-PDF als het bekijken van een website die zijn
 * inhoud met JavaScript opbouwt heeft een browser nodig. Opstarten kost een
 * seconde of twee, dus die betaal je één keer.
 */
let browserPromise: Promise<Browser> | null = null;

export class BrowserUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      'Geen browser beschikbaar. Draai eenmalig `npx playwright install chromium`, ' +
        'of installeer Google Chrome. ' +
        `Oorspronkelijke fout: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

/**
 * Eerst Playwright's eigen Chromium. Lukt dat niet — bijvoorbeeld omdat
 * `npx playwright install` niet bij de download kon — dan de Chrome die al op
 * de machine staat. Dat scheelt een download van een paar honderd megabyte.
 */
async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (first) {
    try {
      return await chromium.launch({ channel: 'chrome' });
    } catch {
      throw new BrowserUnavailableError(first);
    }
  }
}

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launch().catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}
