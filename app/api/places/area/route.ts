import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PlacesError, resolveArea } from '@/lib/places/client';

const querySchema = z.object({ q: z.string().min(2).max(200) });

/** Zet een postcode, plaatsnaam of adres om naar coördinaten. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get('q') ?? '' });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Geef een plaats, postcode of adres op.' }, { status: 400 });
  }

  try {
    const area = await resolveArea(parsed.data.q);
    if (!area) {
      return NextResponse.json({ error: 'Geen locatie gevonden voor die zoekterm.' }, { status: 404 });
    }
    return NextResponse.json(area);
  } catch (error) {
    if (error instanceof PlacesError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error('[area] onverwachte fout', error);
    return NextResponse.json({ error: 'Locatie opzoeken mislukt.' }, { status: 500 });
  }
}
