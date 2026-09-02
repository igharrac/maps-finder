import { NextResponse } from 'next/server';
import { detectSignals } from '@/lib/enrichment/detectors';
import { FetchSiteError, fetchSite } from '@/lib/enrichment/fetchSite';
import type { PlaceSummary } from '@/lib/places/types';
import { scorePlace } from '@/lib/scoring';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;

/**
 * Analyseert de website van één prospect.
 *
 * Bewust per prospect en op verzoek: een automatische analyse van elk gevonden
 * bedrijf zou tientallen vreemde servers per zoekactie aantikken, en dat hoort
 * niet.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });
  }

  const { data: prospect, error: prospectError } = await supabase
    .from('prospects')
    .select('id, google_place_id, prospect_sources(payload)')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single();

  if (prospectError || !prospect) {
    return NextResponse.json({ error: 'Prospect niet gevonden.' }, { status: 404 });
  }

  const sources = prospect.prospect_sources as unknown as Array<{ payload: PlaceSummary }> | null;
  const place = sources?.[0]?.payload;

  if (!place) {
    return NextResponse.json(
      { error: 'Brongegevens ontbreken of zijn verlopen. Zoek het bedrijf opnieuw op.' },
      { status: 409 },
    );
  }

  // Geen website is geen reden om te stoppen — het is de sterkste bevinding die
  // er is. We leggen hem vast als feit en zijn daarmee klaar met analyseren.
  if (!place.websiteUri) {
    const signals = [
      {
        key: 'no_website_listed',
        kind: 'fact' as const,
        label: 'Bij Google staat geen website bij dit bedrijf',
        value: { checked: new Date().toISOString() },
        normalized: 0,
        confidence: 1,
        detectedBy: 'website_probe',
      },
    ];
    const score = await persist(supabase, prospect.id, place, signals);
    return NextResponse.json({ signals, score });
  }

  let signals;
  try {
    const page = await fetchSite(place.websiteUri);
    signals = detectSignals(page);
  } catch (error) {
    if (error instanceof FetchSiteError) {
      // Een onbereikbare site is zelf een signaal, geen fout in ons systeem.
      signals = detectSignals({
        url: place.websiteUri,
        status: 0,
        html: '',
        headers: {},
        elapsedMs: 0,
      });
      await persist(supabase, prospect.id, place, signals);
      return NextResponse.json({
        warning: error.message,
        signals,
        score: scorePlace(place, undefined, signals),
      });
    }
    console.error('[analyze] onverwachte fout', error);
    return NextResponse.json({ error: 'Analyse mislukt.' }, { status: 500 });
  }

  const score = await persist(supabase, prospect.id, place, signals);
  return NextResponse.json({ signals, score });
}

async function persist(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prospectId: string,
  place: PlaceSummary,
  signals: ReturnType<typeof detectSignals>,
) {
  const score = scorePlace(place, undefined, signals);

  await supabase.from('prospect_signals').upsert(
    score.signals.map((signal) => ({
      prospect_id: prospectId,
      key: signal.key,
      kind: signal.kind,
      label: signal.label,
      value: signal.value === undefined ? null : signal.value,
      confidence: signal.confidence,
      detected_by: signal.detectedBy,
    })),
    { onConflict: 'prospect_id,key' },
  );

  await supabase.from('prospect_scores').upsert(
    {
      prospect_id: prospectId,
      model_version: score.modelVersion,
      opportunity_score: Math.round(score.opportunityScore),
      business_potential: Math.round(score.businessPotential),
      digital_maturity: Math.round(score.digitalMaturity),
      weights: score.weights,
    },
    { onConflict: 'prospect_id,model_version' },
  );

  await supabase
    .from('prospects')
    .update({ analyzed_at: new Date().toISOString(), status: 'analyzed' })
    .eq('id', prospectId);

  return score;
}
