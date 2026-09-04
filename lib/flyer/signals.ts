import type { Signal } from '@/lib/scoring/signals';

type StoredSignal = {
  key: string;
  kind: Signal['kind'];
  label: string;
  value: unknown;
  confidence: number;
  detected_by: string;
};

/**
 * Zet opgeslagen signalen terug om naar de vorm die de kansenlaag verwacht.
 *
 * `normalized` wordt niet opgeslagen — dat is een rekenwaarde, geen waarneming —
 * dus die leiden we hier terug af uit de opgeslagen waarde. Deze functie stond
 * eerst gekopieerd in de flyerroute; dat is precies het soort duplicaat dat
 * stilletjes uit elkaar loopt.
 */
export function normalizeStoredSignals(rows: unknown): Signal[] {
  const stored = (rows ?? []) as StoredSignal[];

  return stored.map((s) => {
    const value = s.value as Record<string, unknown> | null;
    let normalized: number | null = null;

    switch (s.key) {
      case 'has_request_form':
        normalized = value && value.formCount && value.matchedKeyword ? 1 : 0;
        break;
      case 'mobile_friendly':
        normalized = value && value.hasViewport ? 1 : 0;
        break;
      case 'shows_reviews':
        normalized = value && value.marker ? 1 : 0;
        break;
      case 'https':
        normalized = typeof value?.url === 'string' && value.url.startsWith('https://') ? 1 : 0;
        break;
      case 'no_website_listed':
        normalized = 0;
        break;
      case 'has_website':
        normalized = s.value ? 1 : 0;
        break;
      case 'site_reachable':
        normalized =
          value && typeof value.status === 'number' && value.status >= 200 && value.status < 400
            ? 1
            : 0;
        break;
      default:
        normalized = null;
    }

    return {
      key: s.key,
      kind: s.kind,
      label: s.label,
      value: s.value,
      normalized,
      confidence: s.confidence,
      detectedBy: s.detected_by,
    };
  });
}
