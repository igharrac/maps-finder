import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PlacesError, searchNearby } from '@/lib/places/client';
import { scorePlace } from '@/lib/scoring';
import { createClient } from '@/lib/supabase/server';
import { markerStyleFor, type ProspectStatus } from '@/lib/types';

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusMeters: z.number().min(100).max(50_000),
  // Google accepteert er maximaal 50 in één verzoek.
  includedTypes: z.array(z.string().min(1).max(60)).max(50).optional(),
});

/** Meters tussen twee coördinaten (haversine). */
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Zoekt bedrijven in een gebied en verrijkt ze met onze eigen kennis.
 *
 * Deze route wordt uitsluitend aangeroepen na een expliciete actie van de
 * gebruiker ("Zoek in dit kaartgebied"), nooit bij pannen of zoomen — elk
 * verzoek kost geld.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ongeldige zoekparameters.', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });
  }

  const { lat, lng, radiusMeters, includedTypes } = parsed.data;

  try {
    const { places, requestCount, warnings } = await searchNearby({
      lat,
      lng,
      radiusMeters,
      includedTypes,
    });

    // Welke van deze bedrijven kennen we al? Voorkomt dat een bedrijf dat al
    // een flyer heeft gehad opnieuw als nieuw in de lijst verschijnt.
    const placeIds = places.map((p) => p.placeId);
    const { data: known } = placeIds.length
      ? await supabase
          .from('prospects')
          .select('id, google_place_id, status')
          .eq('owner_id', user.id)
          .in('google_place_id', placeIds)
      : { data: [] as Array<{ id: string; google_place_id: string; status: string }> };

    const byPlaceId = new Map(
      (known ?? []).map((row) => [row.google_place_id, row] as const),
    );

    const results = places.map((place) => {
      const existing = byPlaceId.get(place.placeId);
      const score = scorePlace(place);
      const status = (existing?.status ?? 'discovered') as ProspectStatus;

      return {
        prospectId: existing?.id ?? null,
        status,
        markerStyle: markerStyleFor(status, score.opportunityScore),
        place,
        score,
        distanceMeters: distanceMeters({ lat, lng }, place),
      };
    });

    results.sort((a, b) => b.score.opportunityScore - a.score.opportunityScore);

    return NextResponse.json({ results, requestCount, warnings });
  } catch (error) {
    if (error instanceof PlacesError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error('[search] onverwachte fout', error);
    return NextResponse.json({ error: 'Zoeken mislukt.' }, { status: 500 });
  }
}
