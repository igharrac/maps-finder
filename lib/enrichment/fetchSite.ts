import type { PageInput } from './detectors';

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 1_500_000;

/**
 * Een browser-User-Agent, en niet een eigen botnaam.
 *
 * Veel Nederlandse hostingpartijen en Cloudflare-instellingen weigeren alles wat
 * zich niet als browser voorstelt met een 403. Dan lijkt een site onbereikbaar
 * terwijl hij het gewoon doet, en dat is precies de verkeerde conclusie: we
 * zouden opschrijven dat iemands website plat lag terwijl WIJ geweigerd werden.
 *
 * Het blijft één verzoek per bedrijf, op het moment dat een mens erop klikt.
 * Niet meer dan wat er gebeurt als je de pagina zelf opent.
 */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/** Adressen die we nooit opvragen — die wijzen naar ons eigen netwerk. */
const BLOCKED_HOSTNAMES =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;

/**
 * Waarom het ophalen niet lukte. Het onderscheid tussen "de site ligt plat" en
 * "wij werden geweigerd" is wezenlijk: alleen het eerste is een bevinding over
 * het bedrijf, het tweede is een probleem aan onze kant.
 */
export type FetchFailure =
  | 'invalid_url'
  | 'private_address'
  | 'timeout'
  | 'dns'
  | 'tls'
  | 'network'
  | 'blocked'
  | 'server_error'
  | 'not_found'
  | 'too_large';

export class FetchSiteError extends Error {
  constructor(
    message: string,
    readonly reason: FetchFailure,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FetchSiteError';
  }

  /** Zegt deze fout iets over het bedrijf, of alleen over onze poging? */
  get isAboutTheBusiness(): boolean {
    return this.reason === 'dns' || this.reason === 'server_error' || this.reason === 'not_found';
  }
}

function classifyStatus(status: number): FetchFailure | null {
  if (status >= 200 && status < 400) return null;
  if (status === 401 || status === 403 || status === 406 || status === 429) return 'blocked';
  if (status === 404 || status === 410) return 'not_found';
  if (status >= 500) return 'server_error';
  return 'blocked';
}

async function attempt(url: URL, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      'Upgrade-Insecure-Requests': '1',
    },
    redirect: 'follow',
    signal,
    cache: 'no-store',
  });
}

/** Varianten om te proberen: zoals opgegeven, en met of zonder www. */
function candidates(url: URL): URL[] {
  const list = [url];
  const alt = new URL(url.toString());

  if (alt.hostname.startsWith('www.')) {
    alt.hostname = alt.hostname.slice(4);
  } else {
    alt.hostname = `www.${alt.hostname}`;
  }
  list.push(alt);

  return list;
}

/**
 * Haalt één pagina op. Bewust beperkt: één bedrijf, korte timeout, harde
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
    throw new FetchSiteError('Alleen http en https worden opgehaald.', 'invalid_url');
  }

  if (BLOCKED_HOSTNAMES.test(url.hostname)) {
    throw new FetchSiteError(`Adres ${url.hostname} wordt niet opgehaald.`, 'private_address');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  let lastError: FetchSiteError | null = null;

  try {
    for (const candidate of candidates(url)) {
      let response: Response;

      try {
        response = await attempt(candidate, controller.signal);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new FetchSiteError(
            `De website reageerde niet binnen ${TIMEOUT_MS / 1000} seconden.`,
            'timeout',
          );
        }

        const detail = error instanceof Error ? error.message : String(error);
        const cause = (error as { cause?: { code?: string } })?.cause?.code ?? '';

        lastError =
          cause === 'ENOTFOUND' || cause === 'EAI_AGAIN'
            ? new FetchSiteError(`Domein ${candidate.hostname} bestaat niet.`, 'dns')
            : /certificate|TLS|SSL/i.test(detail + cause)
              ? new FetchSiteError('Het beveiligingscertificaat is niet geldig.', 'tls')
              : new FetchSiteError(`Verbinding mislukt: ${detail}`, 'network');
        continue;
      }

      const failure = classifyStatus(response.status);
      if (failure) {
        lastError = new FetchSiteError(
          failure === 'blocked'
            ? `De site weigerde ons verzoek (statuscode ${response.status}). Waarschijnlijk een beveiliging die geautomatiseerd verkeer blokkeert — de site zelf doet het waarschijnlijk gewoon.`
            : `De site gaf statuscode ${response.status}.`,
          failure,
          response.status,
        );
        continue;
      }

      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > MAX_BYTES) {
        throw new FetchSiteError('Pagina is te groot om te analyseren.', 'too_large');
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_BYTES) {
        throw new FetchSiteError('Pagina is te groot om te analyseren.', 'too_large');
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      return {
        url: response.url || candidate.toString(),
        status: response.status,
        html: new TextDecoder('utf-8', { fatal: false }).decode(buffer),
        headers,
        elapsedMs: Date.now() - startedAt,
      };
    }

    throw lastError ?? new FetchSiteError('De website kon niet opgehaald worden.', 'network');
  } finally {
    clearTimeout(timer);
  }
}
