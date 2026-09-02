'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import {
  foundedInfo,
  MARKER_APPEARANCE,
  STATUS_LABELS,
  type MarkerStyleKey,
  type SearchResult,
} from '@/lib/types';
import { createMarkerElement } from './markers';

type Props = {
  apiKey: string;
  mapId: string;
  center: { lat: number; lng: number };
  radiusMeters: number;
  results: SearchResult[];
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  searching: boolean;
  onSelect: (placeId: string | null) => void;
  onHover: (placeId: string | null) => void;
  onSearchThisArea: (center: { lat: number; lng: number }, radiusMeters: number) => void;
};

/**
 * setOptions() geldt voor de hele pagina en accepteert maar één aanroep. In
 * development draait React elk effect twee keer, dus zonder deze vlag klaagt de
 * loader bij de tweede aanroep.
 */
let mapsOptionsSet = false;

const LEGEND_ORDER: MarkerStyleKey[] = [
  'new',
  'interesting',
  'high_potential',
  'flyer_planned',
  'flyer_delivered',
  'responded',
];

export function ProspectMap({
  apiKey,
  mapId,
  center,
  radiusMeters,
  results,
  selectedPlaceId,
  hoveredPlaceId,
  searching,
  onSelect,
  onHover,
  onSearchThisArea,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef(new Map<string, google.maps.marker.AdvancedMarkerElement>());
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const markerLibRef = useRef<google.maps.MarkerLibrary | null>(null);
  const geometryRef = useRef<google.maps.GeometryLibrary | null>(null);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [areaDirty, setAreaDirty] = useState(false);
  const [tooltip, setTooltip] = useState<{ result: SearchResult; x: number; y: number } | null>(
    null,
  );

  /**
   * Bouwt de inhoud van een marker inclusief hover-afhandeling.
   *
   * De listeners horen bij het element zelf: zodra een marker geselecteerd
   * raakt wordt zijn content vervangen, en losse listeners zouden dan verdwijnen.
   */
  const buildContent = useCallback(
    (result: SearchResult, selected: boolean) => {
      const el = createMarkerElement(result.markerStyle, {
        selected,
        title: result.place.name,
      });

      const TOOLTIP_W = 240;
      const TOOLTIP_H = 150;

      const place = (event: MouseEvent) => {
        const bounds = containerRef.current?.getBoundingClientRect();
        if (!bounds) return;

        // Positie meteen binnen de kaart houden. Dit hier doen en niet tijdens
        // het renderen, want een ref uitlezen tijdens render is niet veilig.
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;

        setTooltip({
          result,
          x: Math.min(Math.max(x + 16, 8), Math.max(8, bounds.width - TOOLTIP_W - 8)),
          y: Math.min(Math.max(y - 12, 8), Math.max(8, bounds.height - TOOLTIP_H - 8)),
        });
      };

      el.addEventListener('mouseenter', (event) => {
        onHover(result.place.placeId);
        place(event as MouseEvent);
      });
      el.addEventListener('mousemove', (event) => place(event as MouseEvent));
      el.addEventListener('mouseleave', () => {
        onHover(null);
        setTooltip(null);
      });

      return el;
    },
    [onHover],
  );

  // --- kaart initialiseren -------------------------------------------------
  useEffect(() => {
    // React draait dit effect in development twee keer. De eerste ronde wordt
    // door de cleanup geannuleerd en maakt dus niets aan; de tweede bouwt de
    // kaart. Niet blokkeren op een "al gestart"-vlag daarom: dan annuleert
    // ronde één zichzelf en komt ronde twee er niet doorheen, en blijft het
    // scherm leeg.
    if (!containerRef.current || mapRef.current || !apiKey) return;
    let cancelled = false;

    if (!mapsOptionsSet) {
      setOptions({ key: apiKey, v: 'weekly', language: 'nl', region: 'NL' });
      mapsOptionsSet = true;
    }

    (async () => {
      try {
        const [{ Map: GMap }, markerLib, geometryLib] = await Promise.all([
          importLibrary('maps'),
          importLibrary('marker'),
          importLibrary('geometry'),
        ]);
        if (cancelled || !containerRef.current) return;

        markerLibRef.current = markerLib;
        geometryRef.current = geometryLib;

        const map = new GMap(containerRef.current, {
          center,
          zoom: 14,
          mapId,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });

        // Pannen en zoomen doet bewust NIETS behalve een knop tonen: elke
        // zoekactie kost geld, dus die start de gebruiker zelf.
        map.addListener('idle', () => setAreaDirty(true));
        map.addListener('click', () => onSelect(null));

        mapRef.current = map;
        setReady(true);
      } catch (error) {
        console.error('[map] laden mislukt', error);
        setLoadError(
          'De kaart kon niet geladen worden. Controleer de browsersleutel en of Maps JavaScript API aanstaat.',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // Bewust eenmalig: de kaart wordt niet opnieuw opgebouwd bij statewijzigingen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, mapId]);

  // --- zoekgebied tekenen --------------------------------------------------
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    circleRef.current?.setMap(null);
    circleRef.current = new google.maps.Circle({
      map: mapRef.current,
      center,
      radius: radiusMeters,
      strokeColor: '#14594A',
      strokeOpacity: 0.7,
      strokeWeight: 1.5,
      fillColor: '#14594A',
      fillOpacity: 0.05,
      clickable: false,
    });

    mapRef.current.panTo(center);
    setAreaDirty(false);
  }, [ready, center, radiusMeters]);

  // --- markers bijwerken ---------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const markerLib = markerLibRef.current;
    if (!ready || !map || !markerLib) return;

    clustererRef.current?.clearMarkers();
    markersRef.current.clear();

    const markers = results.map((result) => {
      const marker = new markerLib.AdvancedMarkerElement({
        position: { lat: result.place.lat, lng: result.place.lng },
        content: buildContent(result, false),
        title: result.place.name,
        gmpClickable: true,
      });

      // Advanced markers gebruiken gmp-click; het gewone click-event is verouderd.
      marker.addListener('gmp-click', () => onSelect(result.place.placeId));
      markersRef.current.set(result.place.placeId, marker);
      return marker;
    });

    clustererRef.current ??= new MarkerClusterer({ map });
    clustererRef.current.addMarkers(markers);

    return () => {
      clustererRef.current?.removeMarkers(markers);
    };
  }, [ready, results, onSelect, buildContent]);

  // --- selectie en hover benadrukken ---------------------------------------
  useEffect(() => {
    if (!ready) return;
    const active = selectedPlaceId ?? hoveredPlaceId;

    for (const result of results) {
      const marker = markersRef.current.get(result.place.placeId);
      if (!marker) continue;
      const isActive = result.place.placeId === active;
      marker.content = buildContent(result, isActive);
      marker.zIndex = isActive ? 999 : undefined;
    }
  }, [ready, results, selectedPlaceId, hoveredPlaceId, buildContent]);

  function handleSearchThisArea() {
    const map = mapRef.current;
    if (!map) return;

    const c = map.getCenter();
    const bounds = map.getBounds();
    if (!c) return;

    // Straal = afstand van middelpunt tot de rand van het zichtbare gebied.
    let radius = radiusMeters;
    const spherical = geometryRef.current?.spherical;
    if (bounds && spherical) {
      radius = Math.round(spherical.computeDistanceBetween(c, bounds.getNorthEast()));
    }

    onSearchThisArea(
      { lat: c.lat(), lng: c.lng() },
      Math.min(Math.max(radius, 200), 50_000),
    );
    setAreaDirty(false);
  }

  return (
    <div className="relative h-full w-full bg-surface-2">
      <div ref={containerRef} className="h-full w-full" />

      {loadError ? (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-sm text-center text-sm text-ink-2">{loadError}</p>
        </div>
      ) : null}

      {tooltip ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 w-60 rounded-xl border border-line bg-surface p-3 shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="flex items-start gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-tight">{tooltip.result.place.name}</p>
              <p className="mt-0.5 text-[11px] text-ink-3">
                {tooltip.result.place.categoryLabel ?? 'Categorie onbekend'} ·{' '}
                {tooltip.result.distanceMeters < 1000
                  ? `${tooltip.result.distanceMeters} m`
                  : `${(tooltip.result.distanceMeters / 1000).toFixed(1).replace('.', ',')} km`}
              </p>
            </div>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-display text-base tabular"
              style={{
                background: MARKER_APPEARANCE[tooltip.result.markerStyle].color,
                color: '#fff',
              }}
            >
              {tooltip.result.score.opportunityScore}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-2">
            {tooltip.result.place.rating !== null ? (
              <span className="tabular">
                ★ {tooltip.result.place.rating.toFixed(1).replace('.', ',')}
              </span>
            ) : null}
            <span>{tooltip.result.place.reviewCount ?? 0} reviews</span>
            <span className="ml-auto font-medium">{STATUS_LABELS[tooltip.result.status]}</span>
          </div>

          {(() => {
            const founded = foundedInfo(tooltip.result.score.signals);
            if (!founded) return null;
            return (
              <p className="mt-1.5 text-[11px] font-medium text-accent">{founded.label}</p>
            );
          })()}

          {tooltip.result.score.signals.filter((s) => s.kind === 'fact').length ? (
            <ul className="mt-2 flex flex-col gap-1 border-t border-surface-2 pt-2">
              {tooltip.result.score.signals
                .filter((s) => s.kind === 'fact' && s.key !== 'founded_year')
                .slice(0, 3)
                .map((signal) => (
                  <li key={signal.key} className="text-[11px] leading-snug text-ink-2">
                    {signal.label}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {areaDirty && !searching ? (
        <button
          type="button"
          onClick={handleSearchThisArea}
          className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-white shadow-lg"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-6.2-8.6" />
            <path d="M21 3v6h-6" />
          </svg>
          Zoek in dit kaartgebied
        </button>
      ) : null}

      {searching ? (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-white shadow-lg">
          Bezig met zoeken…
        </div>
      ) : null}

      <div className="absolute bottom-10 left-4 rounded-xl border border-line bg-surface/95 p-3 shadow-sm">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-3">Legenda</p>
        <ul className="grid grid-cols-2 gap-x-5 gap-y-1.5">
          {LEGEND_ORDER.map((key) => {
            const { color, shape, label } = MARKER_APPEARANCE[key];
            return (
              <li key={key} className="flex items-center gap-2 text-[11px]">
                <span
                  aria-hidden="true"
                  className="inline-block h-3.5 w-3.5 shrink-0 border-2 border-white shadow-[0_0_0_1px_var(--color-line-strong)]"
                  style={{
                    background: color,
                    borderRadius:
                      shape === 'square' ? '5px' : shape === 'bubble' ? '50% 50% 50% 3px' : '50%',
                    transform: shape === 'diamond' ? 'rotate(45deg)' : undefined,
                  }}
                />
                {label}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Attributie is verplicht bij gebruik van Google-gegevens. */}
      <p className="absolute bottom-3 left-4 text-[10px] text-ink-3">
        Kaartgegevens ©{new Date().getFullYear()} Google · Bedrijfsgegevens via Google Places
      </p>
    </div>
  );
}
