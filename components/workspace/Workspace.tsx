'use client';

import { useCallback, useMemo, useState } from 'react';
import { CATEGORY_GROUPS } from '@/lib/categories';
import { MARKER_ORDER, type SearchResult, type SortId } from '@/lib/types';
import { DEFAULT_FILTERS, FilterSidebar, type Filters } from './FilterSidebar';
import { ProspectMap } from './ProspectMap';
import { ResultsList } from './ResultsList';
import { TopBar } from './TopBar';

type Props = {
  userEmail: string;
  mapsApiKey: string;
  mapId: string;
  missingEnv: string[];
};

/** Zaandam als startpunt; de gebruiker zoekt daarna zelf een gebied. */
const INITIAL_CENTER = { lat: 52.4389, lng: 4.8296 };

export function Workspace({ userEmail, mapsApiKey, mapId, missingEnv }: Props) {
  const [center, setCenter] = useState(INITIAL_CENTER);
  const [radiusMeters, setRadiusMeters] = useState(2000);
  const [areaLabel, setAreaLabel] = useState('Zaandam');

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [results, setResults] = useState<SearchResult[]>([]);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [savingPlaceId, setSavingPlaceId] = useState<string | null>(null);
  const [analyzingPlaceId, setAnalyzingPlaceId] = useState<string | null>(null);
  const [flyerSelection, setFlyerSelection] = useState<string[]>([]);
  const [sort, setSort] = useState<SortId>('score');
  const [generatingFlyers, setGeneratingFlyers] = useState(false);

  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [requestCount, setRequestCount] = useState(0);

  const includedTypes = useMemo(
    () =>
      CATEGORY_GROUPS.filter((g) => filters.categoryIds.includes(g.id)).flatMap((g) => g.types),
    [filters.categoryIds],
  );

  const runSearch = useCallback(
    async (at: { lat: number; lng: number }, radius: number, types: string[]) => {
      setSearching(true);
      setError(null);
      setWarnings([]);

      try {
        const response = await fetch('/api/places/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: at.lat,
            lng: at.lng,
            radiusMeters: radius,
            includedTypes: types.length ? types : undefined,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          setError(data.error ?? 'Zoeken mislukt.');
          return;
        }

        setResults(data.results as SearchResult[]);
        setWarnings((data.warnings as string[]) ?? []);
        setRequestCount((n) => n + (data.requestCount ?? 1));
      } catch {
        setError('Kon de zoekopdracht niet uitvoeren. Controleer je verbinding.');
      } finally {
        setSearching(false);
      }
    },
    [],
  );

  const handleResolveArea = useCallback(
    async (query: string, radius: number) => {
      setResolving(true);
      setError(null);

      try {
        const response = await fetch(`/api/places/area?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? 'Gebied niet gevonden.');
          return;
        }

        const next = { lat: data.lat as number, lng: data.lng as number };
        setCenter(next);
        setRadiusMeters(radius);
        setAreaLabel(data.label as string);
        await runSearch(next, radius, includedTypes);
      } catch {
        setError('Locatie opzoeken mislukt.');
      } finally {
        setResolving(false);
      }
    },
    [includedTypes, runSearch],
  );

  const handleSearchThisArea = useCallback(
    (at: { lat: number; lng: number }, radius: number) => {
      setCenter(at);
      setRadiusMeters(radius);
      void runSearch(at, radius, includedTypes);
    },
    [includedTypes, runSearch],
  );

  const handleSave = useCallback(async (result: SearchResult) => {
    setSavingPlaceId(result.place.placeId);
    try {
      const response = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          place: result.place,
          status: 'saved',
          score: {
            modelVersion: result.score.modelVersion,
            opportunityScore: result.score.opportunityScore,
            businessPotential: result.score.businessPotential,
            digitalMaturity: result.score.digitalMaturity,
            weights: result.score.weights,
            signals: result.score.signals.map((s) => ({
              key: s.key,
              kind: s.kind,
              label: s.label,
              value: s.value ?? null,
              confidence: s.confidence,
              detectedBy: s.detectedBy,
            })),
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Opslaan mislukt.');
        return;
      }

      setResults((current) =>
        current.map((r) =>
          r.place.placeId === result.place.placeId
            ? { ...r, prospectId: data.prospectId, status: 'saved', markerStyle: 'interesting' }
            : r,
        ),
      );
    } catch {
      setError('Opslaan mislukt.');
    } finally {
      setSavingPlaceId(null);
    }
  }, []);

  const handleAnalyze = useCallback(async (result: SearchResult) => {
    if (!result.prospectId) return;
    setAnalyzingPlaceId(result.place.placeId);
    setWarnings([]);

    try {
      const response = await fetch(`/api/prospects/${result.prospectId}/analyze`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? 'Analyse mislukt.');
        return;
      }

      // Een onbereikbare site is geen fout maar een bevinding; die melden we
      // als waarschuwing en de score wordt gewoon bijgewerkt.
      if (data.warning) setWarnings([data.warning as string]);

      setResults((current) =>
        current.map((r) =>
          r.place.placeId === result.place.placeId
            ? { ...r, score: data.score, status: 'analyzed', markerStyle: 'interesting' }
            : r,
        ),
      );
    } catch {
      setError('Analyse mislukt.');
    } finally {
      setAnalyzingPlaceId(null);
    }
  }, []);

  const handleUnsave = useCallback(async (result: SearchResult) => {
    if (!result.prospectId) return;
    setSavingPlaceId(result.place.placeId);
    setError(null);
    setWarnings([]);

    try {
      const response = await fetch(`/api/prospects/${result.prospectId}`, { method: 'DELETE' });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? 'Verwijderen mislukt.');
        return;
      }

      setFlyerSelection((current) => current.filter((id) => id !== result.prospectId));
      setResults((current) =>
        current.map((r) =>
          r.place.placeId === result.place.placeId
            ? {
                ...r,
                prospectId: null,
                status: 'discovered',
                markerStyle: r.score.opportunityScore >= 80 ? 'high_potential' : r.score.opportunityScore >= 65 ? 'interesting' : 'new',
              }
            : r,
        ),
      );
    } catch {
      setError('Verwijderen mislukt.');
    } finally {
      setSavingPlaceId(null);
    }
  }, []);

  const handleReject = useCallback(async (result: SearchResult) => {
    if (!result.prospectId) return;
    setError(null);

    try {
      const response = await fetch(`/api/prospects/${result.prospectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? 'Afwijzen mislukt.');
        return;
      }

      setFlyerSelection((current) => current.filter((id) => id !== result.prospectId));
      setResults((current) =>
        current.map((r) =>
          r.place.placeId === result.place.placeId
            ? { ...r, status: 'rejected', markerStyle: 'new' }
            : r,
        ),
      );
    } catch {
      setError('Afwijzen mislukt.');
    }
  }, []);

  const toggleFlyer = useCallback((prospectId: string) => {
    setFlyerSelection((current) =>
      current.includes(prospectId)
        ? current.filter((id) => id !== prospectId)
        : [...current, prospectId],
    );
  }, []);

  const handleGenerateFlyers = useCallback(async () => {
    if (flyerSelection.length === 0) return;
    setGeneratingFlyers(true);
    setError(null);
    setWarnings([]);

    try {
      const response = await fetch('/api/flyers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectIds: flyerSelection }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? 'Flyers maken mislukt.');
        if (Array.isArray(data.skipped) && data.skipped.length) {
          setWarnings(
            data.skipped.map(
              (s: { name: string; reason: string }) => `${s.name}: ${s.reason}`,
            ),
          );
        }
        return;
      }

      // Wie is overgeslagen staat in de header, want het antwoord zelf is de PDF.
      const summaryHeader = response.headers.get('X-Flyer-Summary');
      if (summaryHeader) {
        try {
          const summary = JSON.parse(decodeURIComponent(summaryHeader));
          if (Array.isArray(summary.skipped) && summary.skipped.length) {
            setWarnings(
              summary.skipped.map(
                (s: { name: string; reason: string }) => `Overgeslagen — ${s.name}: ${s.reason}`,
              ),
            );
          }
        } catch {
          // Samenvatting is bijzaak; de PDF is het resultaat.
        }
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `flyers-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Flyers maken mislukt.');
    } finally {
      setGeneratingFlyers(false);
    }
  }, [flyerSelection]);

  const visible = useMemo(() => {
    const filtered = results.filter((r) => {
      if (r.score.opportunityScore < filters.minScore) return false;
      if (filters.minRating > 0 && (r.place.rating ?? 0) < filters.minRating) return false;
      if (filters.minReviews > 0 && (r.place.reviewCount ?? 0) < filters.minReviews) return false;
      // OF binnen de categorieën: één treffer is genoeg.
      if (filters.markerStyles.length && !filters.markerStyles.includes(r.markerStyle))
        return false;
      if (!filters.showRejected && r.status === 'rejected') return false;
      if (filters.hideDelivered && r.status === 'flyer_delivered') return false;
      return true;
    });

    // Sorteren op status volgt de volgorde van de legenda, zodat lijst en kaart
    // dezelfde logica gebruiken.
    const byStatus = (r: SearchResult) => MARKER_ORDER.indexOf(r.markerStyle);

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'status':
          return byStatus(a) - byStatus(b) || b.score.opportunityScore - a.score.opportunityScore;
        case 'distance':
          return a.distanceMeters - b.distanceMeters;
        case 'reviews':
          return (b.place.reviewCount ?? 0) - (a.place.reviewCount ?? 0);
        case 'rating':
          return (b.place.rating ?? 0) - (a.place.rating ?? 0);
        default:
          return b.score.opportunityScore - a.score.opportunityScore;
      }
    });
  }, [results, filters, sort]);

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        areaLabel={areaLabel}
        radiusMeters={radiusMeters}
        userEmail={userEmail}
        resolving={resolving}
        onResolveArea={handleResolveArea}
      />

      {missingEnv.length ? (
        <p role="alert" className="bg-ochre-tint px-4 py-2 text-xs text-ochre-ink">
          Ontbrekende omgevingsvariabelen: {missingEnv.join(', ')}. Vul .env.local aan en herstart de
          dev-server.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="bg-ochre-tint px-4 py-2 text-xs text-ochre-ink">
          {error}
        </p>
      ) : null}

      {warnings.map((warning) => (
        <p key={warning} role="status" className="bg-surface-2 px-4 py-2 text-xs text-ink-2">
          {warning}
        </p>
      ))}

      <div className="flex min-h-0 flex-1">
        <FilterSidebar filters={filters} counts={{}} onChange={setFilters} />

        <main className="relative min-w-0 flex-1">
          <ProspectMap
            apiKey={mapsApiKey}
            mapId={mapId}
            center={center}
            radiusMeters={radiusMeters}
            results={visible}
            selectedPlaceId={selectedPlaceId}
            hoveredPlaceId={hoveredPlaceId}
            searching={searching}
            onSelect={setSelectedPlaceId}
            onHover={setHoveredPlaceId}
            onSearchThisArea={handleSearchThisArea}
          />
          {requestCount > 0 ? (
            <p className="absolute right-4 top-4 rounded-md border border-line bg-surface/95 px-2 py-1 text-[10px] text-ink-3">
              {requestCount} Places-verzoeken deze sessie
            </p>
          ) : null}
        </main>

        <ResultsList
          results={visible}
          totalBeforeFilter={results.length}
          selectedPlaceId={selectedPlaceId}
          hoveredPlaceId={hoveredPlaceId}
          savingPlaceId={savingPlaceId}
          analyzingPlaceId={analyzingPlaceId}
          flyerSelection={flyerSelection}
          sort={sort}
          onSortChange={setSort}
          onSelect={setSelectedPlaceId}
          onHover={setHoveredPlaceId}
          onSave={handleSave}
          onUnsave={handleUnsave}
          onReject={handleReject}
          onAnalyze={handleAnalyze}
          onToggleFlyer={toggleFlyer}
        />
      </div>

      {flyerSelection.length > 0 ? (
        <div className="flex shrink-0 items-center gap-4 border-t border-line bg-ink px-4 py-3 text-white">
          <span className="text-sm font-medium">
            {flyerSelection.length} {flyerSelection.length === 1 ? 'bedrijf' : 'bedrijven'} geselecteerd
          </span>
          <span className="text-xs opacity-70">
            Bedrijven zonder analyse of zonder concrete bevindingen worden overgeslagen.
          </span>
          <button
            type="button"
            onClick={() => setFlyerSelection([])}
            className="ml-auto text-xs underline opacity-80"
          >
            Selectie wissen
          </button>
          <button
            type="button"
            onClick={handleGenerateFlyers}
            disabled={generatingFlyers}
            className="rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-ink disabled:opacity-60"
          >
            {generatingFlyers ? 'Bezig…' : 'Genereer flyers (PDF)'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
