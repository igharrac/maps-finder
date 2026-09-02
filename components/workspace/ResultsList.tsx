'use client';

import { MARKER_APPEARANCE, STATUS_LABELS, type SearchResult } from '@/lib/types';

type Props = {
  results: SearchResult[];
  totalBeforeFilter: number;
  selectedPlaceId: string | null;
  savingPlaceId: string | null;
  analyzingPlaceId: string | null;
  flyerSelection: string[];
  onSelect: (placeId: string | null) => void;
  onHover: (placeId: string | null) => void;
  onSave: (result: SearchResult) => void;
  onAnalyze: (result: SearchResult) => void;
  onToggleFlyer: (prospectId: string) => void;
};

function scoreClasses(score: number): string {
  if (score >= 80) return 'bg-accent text-white';
  if (score >= 65) return 'bg-ochre-tint text-ochre-ink';
  return 'bg-surface-2 text-ink-2';
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export function ResultsList({
  results,
  totalBeforeFilter,
  selectedPlaceId,
  savingPlaceId,
  analyzingPlaceId,
  flyerSelection,
  onSelect,
  onHover,
  onSave,
  onAnalyze,
  onToggleFlyer,
}: Props) {
  return (
    <section
      aria-label="Zoekresultaten"
      className="flex w-85 shrink-0 flex-col border-l border-line bg-surface"
    >
      <div className="shrink-0 border-b border-surface-2 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">
            {results.length} {results.length === 1 ? 'bedrijf' : 'bedrijven'}
          </h2>
          {totalBeforeFilter > results.length ? (
            <span className="text-[11px] text-ink-3">
              {totalBeforeFilter - results.length} verborgen door filters
            </span>
          ) : null}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {results.length === 0 ? (
          <li className="px-4 py-10 text-center text-xs leading-relaxed text-ink-3">
            Nog geen resultaten. Zoek een gebied op en start een zoekactie.
          </li>
        ) : null}

        {results.map((result) => {
          const selected = result.place.placeId === selectedPlaceId;
          const appearance = MARKER_APPEARANCE[result.markerStyle];

          return (
            <li
              key={result.place.placeId}
              onMouseEnter={() => onHover(result.place.placeId)}
              onMouseLeave={() => onHover(null)}
              className={
                selected
                  ? 'border-b border-b-surface-2 border-l-[3px] border-l-accent bg-accent-tint px-4 py-3'
                  : 'border-b border-surface-2 px-4 py-3 hover:bg-canvas'
              }
            >
              <button
                type="button"
                onClick={() => onSelect(result.place.placeId)}
                className="w-full text-left"
                aria-current={selected}
              >
                <div className="flex items-start gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight">{result.place.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-3">
                      {result.place.categoryLabel ?? 'Categorie onbekend'} ·{' '}
                      {formatDistance(result.distanceMeters)}
                    </p>
                  </div>
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-lg tabular ${scoreClasses(
                      result.score.opportunityScore,
                    )}`}
                    title={`Business Potential ${result.score.businessPotential} · Digital Maturity ${result.score.digitalMaturity}`}
                  >
                    {result.score.opportunityScore}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-2.5 text-[11px] text-ink-2">
                  {result.place.rating !== null ? (
                    <span className="tabular flex items-center gap-1">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="#B7791F" aria-hidden="true">
                        <path d="m12 3 2.7 5.9 6.3.7-4.7 4.3 1.3 6.3L12 17.1 6.4 20.2l1.3-6.3L3 9.6l6.3-.7L12 3Z" />
                      </svg>
                      {result.place.rating.toFixed(1).replace('.', ',')}
                    </span>
                  ) : (
                    <span className="text-ink-3">Geen rating</span>
                  )}
                  <span>{result.place.reviewCount ?? 0} reviews</span>
                  <span className="ml-auto flex items-center gap-1.5 font-medium">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2 w-2"
                      style={{
                        background: appearance.color,
                        borderRadius: appearance.shape === 'square' ? '2px' : '50%',
                        transform: appearance.shape === 'diamond' ? 'rotate(45deg)' : undefined,
                      }}
                    />
                    {STATUS_LABELS[result.status]}
                  </span>
                </div>

                {/* Signalen zijn belangrijker dan het cijfer: dit is wat je in een
                    gesprek gebruikt. */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {result.score.signals
                    .filter((s) => s.kind === 'fact')
                    .slice(0, 2)
                    .map((signal) => (
                      <span
                        key={signal.key}
                        className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-2"
                      >
                        {signal.label}
                      </span>
                    ))}
                </div>
              </button>

              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => onSave(result)}
                  disabled={savingPlaceId === result.place.placeId || result.prospectId !== null}
                  className={
                    result.prospectId
                      ? 'rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-3'
                      : 'rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-60'
                  }
                >
                  {result.prospectId
                    ? 'Opgeslagen'
                    : savingPlaceId === result.place.placeId
                      ? 'Bezig…'
                      : 'Opslaan'}
                </button>
                {result.prospectId ? (
                  <label
                    className={
                      result.status === 'discovered' || result.status === 'saved'
                        ? 'flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-3 opacity-50'
                        : 'flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-2'
                    }
                    title={
                      result.status === 'discovered' || result.status === 'saved'
                        ? 'Analyseer eerst de site — zonder bevindingen valt er niets te personaliseren'
                        : 'Meenemen in de gepersonaliseerde flyers'
                    }
                  >
                    <input
                      type="checkbox"
                      disabled={result.status === 'discovered' || result.status === 'saved'}
                      checked={flyerSelection.includes(result.prospectId)}
                      onChange={() => onToggleFlyer(result.prospectId!)}
                      className="h-3 w-3 accent-[var(--color-accent)]"
                    />
                    Flyer
                  </label>
                ) : null}
                {result.prospectId ? (
                  <button
                    type="button"
                    onClick={() => onAnalyze(result)}
                    disabled={analyzingPlaceId === result.place.placeId || !result.place.websiteUri}
                    title={
                      result.place.websiteUri
                        ? 'Haalt de website op en zoekt naar signalen'
                        : 'Geen website bekend bij Google'
                    }
                    className="rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-2 hover:border-line-strong disabled:opacity-50"
                  >
                    {analyzingPlaceId === result.place.placeId ? 'Analyseren…' : 'Analyseer site'}
                  </button>
                ) : null}
                <a
                  href={`https://www.google.com/maps/place/?q=place_id:${result.place.placeId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-2 hover:border-line-strong"
                >
                  Google Maps
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
