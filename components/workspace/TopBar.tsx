'use client';

import { useState } from 'react';
import { signOut } from '@/app/login/actions';

type Props = {
  areaLabel: string;
  radiusMeters: number;
  userEmail: string;
  resolving: boolean;
  onResolveArea: (query: string, radiusMeters: number) => void;
};

const RADIUS_OPTIONS = [500, 1000, 2000, 5000, 10_000];

export function TopBar({ areaLabel, radiusMeters, userEmail, resolving, onResolveArea }: Props) {
  const [query, setQuery] = useState('');
  const [radius, setRadius] = useState(radiusMeters);

  return (
    <header className="flex h-14 shrink-0 items-center gap-5 border-b border-line bg-surface px-4">
      <div className="flex w-56 items-center gap-2">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        <span className="font-display text-xl">Maps Finder</span>
      </div>

      <form
        className="flex flex-1 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length >= 2) onResolveArea(query.trim(), radius);
        }}
      >
        <div className="flex h-9 w-[26rem] items-center gap-2 rounded-lg border border-line bg-surface-2 px-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-3)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={areaLabel || 'Postcode, plaats of adres'}
            aria-label="Zoek een gebied"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
          <select
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            aria-label="Zoekstraal"
            className="tabular rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-2"
          >
            {RADIUS_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r < 1000 ? `${r} m` : `${r / 1000} km`}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={resolving || query.trim().length < 2}
          className="h-9 rounded-lg bg-accent px-3.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {resolving ? 'Bezig…' : 'Zoek gebied'}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <span className="max-w-40 truncate text-[11px] text-ink-3">{userEmail}</span>
        <form action={signOut}>
          <button type="submit" className="text-xs text-ink-2 hover:text-ink">
            Uitloggen
          </button>
        </form>
      </div>
    </header>
  );
}
