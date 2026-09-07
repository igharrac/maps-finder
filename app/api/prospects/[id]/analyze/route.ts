import { NextResponse } from 'next/server';
import { looksClientRendered } from '@/lib/enrichment/clientRendered';
import { contactSignals } from '@/lib/enrichment/contacts';
import { detectSignals } from '@/lib/enrichment/detectors';
import { FetchSiteError, fetchSite } from '@/lib/enrichment/fetchSite';
import { RenderSiteError, renderSite } from '@/lib/enrichment/renderSite';
import type { PlaceSummary } from '@/lib/places/types';
import { scorePlace } from '@/lib/scoring';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

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
  let warning: string | null = null;

  try {
    let page = await fetchSite(place.websiteUri);

    // Veel moderne sites zetten hun inhoud pas met JavaScript neer. In de ruwe
    // HTML staat dan een leeg <div> en verder niets. Zonder deze controle
    // zouden we vastleggen dat er geen aanvraagformulier, geen reviews en geen
    // telefoonnummer op de site staan — over een site die dat allemaal wél
    // heeft. Dat is een onwaarheid die uiteindelijk op een gedrukte flyer
    // belandt, dus liever een browser starten dan gokken.
    if (looksClientRendered(page.html)) {
      try {
        page = await renderSite(page.url);
      } catch (renderError) {
        const reden =
          renderError instanceof RenderSiteError && renderError.browserOntbreekt
            ? 'er is geen browser beschikbaar om hem te tonen'
            : 'hij liet zich ook met een browser niet uitlezen';

        // Wat we zeker weten leggen we vast; over de rest zwijgen we liever dan
        // dat we iets verzinnen.
        const eerlijk = [
          {
            key: 'site_reachable',
            kind: 'fact' as const,
            label: 'Website is bereikbaar',
            value: { status: page.status },
            normalized: 1,
            confidence: 1,
            detectedBy: 'website_probe',
          },
          {
            key: 'needs_javascript',
            kind: 'fact' as const,
            label: 'Site bouwt zijn inhoud op met JavaScript — niet uitgelezen',
            value: { url: page.url, reden },
            normalized: null,
            confidence: 1,
            detectedBy: 'website_probe',
          },
        ];

        await persist(supabase, prospect.id, place, eerlijk);
        return NextResponse.json({
          warning:
            `${place.name}: deze site laadt zijn inhoud met JavaScript en ${reden}. ` +
            'Er is niets over de inhoud vastgelegd — beter niets dan iets verzonnens.',
          signals: eerlijk,
          score: scorePlace(place, undefined, eerlijk),
        });
      }

      warning =
        `${place.name}: deze site bouwt zijn inhoud met JavaScript op, ` +
        'dus hij is met een browser opgehaald in plaats van als platte HTML.';
    }

    // Contactgegevens komen uit dezelfde pagina die we toch al ophalen: geen
    // extra verzoek naar de server van het bedrijf.
    signals = [...detectSignals(page), ...contactSignals(page)];
  } catch (error) {
    if (error instanceof FetchSiteError) {
      // Cruciaal onderscheid. Een domein dat niet bestaat of een server die een
      // 500 geeft, zegt iets over het bedrijf. Geweigerd worden door een
      // beveiliging zegt alleen iets over ONS verzoek — de site doet het dan
      // waarschijnlijk prima. Dat als "website onbereikbaar" vastleggen zou een
      // onwaarheid de database in schrijven, en uiteindelijk op papier zetten.
      if (!error.isAboutTheBusiness) {
        return NextResponse.json(
          {
            error: error.message,
            reason: error.reason,
            status: error.status ?? null,
            checkedUrl: place.websiteUri,
          },
          { status: 502 },
        );
      }

      signals = detectSignals({
        url: place.websiteUri,
        status: error.status ?? 0,
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
  return NextResponse.json(warning ? { warning, signals, score } : { signals, score });
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
