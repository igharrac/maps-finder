import type { PageInput } from './detectors';

const TIMEOUT_MS = 8000;
const MAX_BYTES = 1_500_000;

const USER_AGENT =
  'Mozilla/5.0 (compatible; MapsFinderBot/1.0; +lokale bedrijfsanalyse, één verzoek per bedrijf)';

/** Adressen die we nooit opvragen — die wijzen naar ons eigen netwerk. */
const BLOCKED_HOSTNAMES = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;

export class FetchSiteError extends Error {
  constructor(
    message: string,
    readonly reason: 'invalid_url' | 'blocked' | 'timeout' | 'network' | 'too_large',
  ) {
    super(message);
    this.name = 'FetchSiteError';
  }
}

/**
 * Haalt één pagina op. Bewust beperkt: één verzoek, korte timeout, harde
 * groottelimiet. We zijn te gast op andermans server.
 */
export async function fetchSite(rawUrl: string): Promise<PageInput> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FetchSiteError(`Ongeldige URL: ${rawUrl}`, 'invalid_url');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchSiteError(`Alleen http en https worden opgehaald.`, 'invalid_url');
  }

  if (BLOCKED_HOSTNAMES.test(url.hostname)) {
    throw new FetchSiteError(`Adres ${url.hostname} wordt niet opgehaald.`, 'blocked');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'nl,en;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store',
    });

    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_BYTES) {
      throw new FetchSiteError('Pagina is te groot om te analyseren.', 'too_large');
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      throw new FetchSiteError('Pagina is te groot om te analyseren.', 'too_large');
    }

    const html = new TextDecoder('utf-8', { fatal: false }).decode(buffer);

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    return {
      // response.url weerspiegelt de uiteindelijke bestemming na redirects.
      url: response.url || url.toString(),
      status: response.status,
      html,
      headers,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof FetchSiteError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new FetchSiteError('De website reageerde niet binnen acht seconden.', 'timeout');
    }
    throw new FetchSiteError(
      `De website kon niet opgehaald worden: ${error instanceof Error ? error.message : 'onbekende fout'}`,
      'network',
    );
  } finally {
    clearTimeout(timer);
  }
}
