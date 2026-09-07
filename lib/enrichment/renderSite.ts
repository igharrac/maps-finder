import { BrowserUnavailableError, getBrowser } from '@/lib/browser';
import type { PageInput } from './detectors';

/**
 * Haalt een pagina op zoals een bezoeker hem ziet, met JavaScript uitgevoerd.
 *
 * Dit is de terugvaloptie, niet de standaard. Een gewone fetch is sneller en
 * belast de server van het bedrijf nauwelijks; een echte browser starten doen
 * we alleen als de ruwe HTML leeg blijkt. Afbeeldingen, video en lettertypen
 * worden geblokkeerd — we lezen tekst, we kijken niet.
 */

const NAVIGATIE_TIMEOUT_MS = 15_000;

/** Tijd om na het laden nog even bij te komen: React vult vaak net ná load. */
const BEZINK_MS = 1_200;

export class RenderSiteError extends Error {
  constructor(
    message: string,
    readonly browserOntbreekt: boolean,
  ) {
    super(message);
  }
}

export async function renderSite(url: string): Promise<PageInput> {
  const begin = Date.now();

  let browser;
  try {
    browser = await getBrowser();
  } catch (error) {
    if (error instanceof BrowserUnavailableError) {
      throw new RenderSiteError(error.message, true);
    }
    throw new RenderSiteError(String(error), true);
  }

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'nl-NL',
  });

  try {
    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') return route.abort();
      return route.continue();
    });

    const page = await context.newPage();
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATIE_TIMEOUT_MS,
    });

    // networkidle is de beste indicatie dat het bijladen klaar is, maar sommige
    // sites houden een verbinding open en halen hem nooit. Daarom afgekapt.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(BEZINK_MS);

    const html = await page.content();

    return {
      url: page.url(),
      status: response?.status() ?? 200,
      html,
      headers: response ? await response.allHeaders().catch(() => ({})) : {},
      elapsedMs: Date.now() - begin,
    };
  } catch (error) {
    throw new RenderSiteError(
      `De site kon ook met een browser niet geladen worden: ${
        error instanceof Error ? error.message : String(error)
      }`,
      false,
    );
  } finally {
    await context.close().catch(() => {});
  }
}
