import { BrowserUnavailableError, getBrowser } from '@/lib/browser';
import { PAGE_H, PAGE_W, PX_PER_MM } from './template';

/**
 * Zet flyer-HTML om naar PDF.
 *
 * Chromium houdt tekst als vector in de PDF, dus er is geen dpi-grens zoals bij
 * een gerasterde export. Dat maakt het bestand ook klein genoeg om te mailen.
 *
 * De browser is gedeeld met de website-analyse; zie lib/browser.ts.
 */

export class RenderError extends Error {}

export async function renderPdf(html: string): Promise<Buffer> {
  let browser;
  try {
    browser = await getBrowser();
  } catch (error) {
    throw new RenderError(
      error instanceof BrowserUnavailableError
        ? error.message
        : `Geen browser gevonden om de PDF mee te maken: ${String(error)}`,
    );
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    // Artboards kappen te veel inhoud stilzwijgend af. Meten is de enige manier
    // om te merken dat er iets van de flyer valt.
    const overflows = await page.evaluate(() => {
      const out: Array<{ page: number; missing: number }> = [];
      document.querySelectorAll('.art > *').forEach((el, i) => {
        if (el.scrollHeight > el.clientHeight + 1) {
          out.push({ page: i + 1, missing: el.scrollHeight - el.clientHeight });
        }
      });
      return out;
    });

    if (overflows.length) {
      const detail = overflows.map((o) => `pagina ${o.page} (${o.missing}px)`).join(', ');
      throw new RenderError(
        `De inhoud past niet op de flyer: ${detail}. Er zou tekst wegvallen, dus er is niets gemaakt.`,
      );
    }

    return await page.pdf({
      width: `${PAGE_W / PX_PER_MM}mm`,
      height: `${PAGE_H / PX_PER_MM}mm`,
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: false,
    });
  } finally {
    await context.close();
  }
}
