'use client';

import { CATEGORY_GROUPS } from '@/lib/categories';
import { MARKER_APPEARANCE, MARKER_ORDER, type MarkerStyleKey } from '@/lib/types';

export type Filters = {
  categoryIds: string[];
  minScore: number;
  minRating: number;
  minReviews: number;
  /**
   * Categorieën uit de legenda, niet de ruwe prospectstatus. Die twee liepen
   * uiteen: een bedrijf met score 85 krijgt op de kaart de ruit van "hoog
   * potentieel", terwijl zijn status in de database gewoon "ontdekt" is. Wie
   * dan op Hoog potentieel filterde kreeg niets. Nu filtert de lijst op
   * precies wat je op de kaart ziet.
   *
   * Meerdere aangevinkt betekent OF, niet EN.
   */
  markerStyles: MarkerStyleKey[];
  hideDelivered: boolean;
  showRejected: boolean;
};

export const DEFAULT_FILTERS: Filters = {
  categoryIds: ['installatie', 'bouw'],
  minScore: 0,
  minRating: 0,
  minReviews: 0,
  markerStyles: [],
  hideDelivered: false,
  showRejected: false,
};

type Props = {
  filters: Filters;
  counts: Record<string, number>;
  onChange: (next: Filters) => void;
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FilterSidebar({ filters, counts, onChange }: Props) {
  return (
    <aside className="flex w-70 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <h2 className="text-sm font-semibold">Filters</h2>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="text-xs text-accent hover:text-accent-dark"
        >
          Alles wissen
        </button>
      </div>

      <div className="flex flex-col gap-5 px-4 pb-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Branche
          </legend>
          {CATEGORY_GROUPS.map((group) => (
            <label key={group.id} className="flex cursor-pointer items-center gap-2.5 text-xs">
              <input
                type="checkbox"
                checked={filters.categoryIds.includes(group.id)}
                onChange={() =>
                  onChange({ ...filters, categoryIds: toggle(filters.categoryIds, group.id) })
                }
                className="h-3.5 w-3.5 accent-[var(--color-accent)]"
              />
              <span>{group.label}</span>
              {counts[group.id] ? (
                <span className="ml-auto text-[11px] text-ink-3">{counts[group.id]}</span>
              ) : null}
            </label>
          ))}
          <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
            Alle branches gaan in één zoekverzoek, maar Google geeft er hooguit
            twintig terug. Meer aanvinken betekent dus niet meer resultaten, wel
            een bredere mix.
          </p>
        </fieldset>

        <div className="h-px bg-surface-2" />

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="minScore" className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              Opportunity Score
            </label>
            <span className="tabular text-xs font-semibold">{filters.minScore}–100</span>
          </div>
          <input
            id="minScore"
            type="range"
            min={0}
            max={100}
            step={5}
            value={filters.minScore}
            onChange={(e) => onChange({ ...filters, minScore: Number(e.target.value) })}
            className="w-full accent-[var(--color-accent)]"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="minRating" className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              Min. rating
            </label>
            <input
              id="minRating"
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={filters.minRating}
              onChange={(e) => onChange({ ...filters, minRating: Number(e.target.value) })}
              className="tabular h-8 rounded-md border border-line px-2 text-xs"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="minReviews" className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              Min. reviews
            </label>
            <input
              id="minReviews"
              type="number"
              min={0}
              step={5}
              value={filters.minReviews}
              onChange={(e) => onChange({ ...filters, minReviews: Number(e.target.value) })}
              className="tabular h-8 rounded-md border border-line px-2 text-xs"
            />
          </div>
        </div>

        <div className="h-px bg-surface-2" />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Status
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {MARKER_ORDER.map((key) => {
              const active = filters.markerStyles.includes(key);
              const { color, shape, label } = MARKER_APPEARANCE[key];
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onChange({ ...filters, markerStyles: toggle(filters.markerStyles, key) })
                  }
                  className={
                    active
                      ? 'flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-white'
                      : 'flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-2'
                  }
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 shrink-0"
                    style={{
                      background: color,
                      borderRadius: shape === 'square' ? '2px' : '50%',
                      transform: shape === 'diamond' ? 'rotate(45deg)' : undefined,
                    }}
                  />
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
            Meerdere aanvinken toont alles wat in één van die categorieën valt.
            Niets aanvinken toont alles.
          </p>
        </fieldset>

        <div className="h-px bg-surface-2" />

        <div className="flex flex-col gap-2.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-xs">
            <input
              type="checkbox"
              checked={filters.hideDelivered}
              onChange={(e) => onChange({ ...filters, hideDelivered: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            Verberg reeds bezorgd
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-xs">
            <input
              type="checkbox"
              checked={filters.showRejected}
              onChange={(e) => onChange({ ...filters, showRejected: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            Toon afgewezen bedrijven
          </label>
        </div>
      </div>
    </aside>
  );
}
