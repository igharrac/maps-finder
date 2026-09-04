import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { z } from 'zod';
import { flyerReadiness } from '@/lib/flyer/observations';
import { RenderError, renderPdf } from '@/lib/flyer/render';
import { senderFromEnv } from '@/lib/flyer/sender';
import { buildFlyerHtml, buildGenericFlyerHtml } from '@/lib/flyer/template';
import type { PlaceSummary } from '@/lib/places/types';
import type { Signal } from '@/lib/scoring/signals';
import { createClient } from '@/lib/supabase/server';
import { normalizeStoredSignals } from '@/lib/flyer/signals';

export const maxDuration = 60;

const querySchema = z.object({ prospectId: z.string().uuid().optional() });

/**
 * Toont één flyer om te bekijken, en levert altijd iets bruikbaars op.
 *
 * Komt dit bedrijf in aanmerking voor een eigen flyer, dan krijg je die. Zo
 * niet — nog niet geanalyseerd, site op orde, te weinig gevonden — dan de
 * generieke. Een knop die soms niets doet is erger dan een knop die soms het
 * tweede beste geeft.
 *
 * De PDF komt inline terug zodat de browser hem in een tabblad kan tonen in
 * plaats van te downloaden.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    prospectId: url.searchParams.get('prospectId') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 });
  }

  const { sender, missing } = senderFromEnv();
  if (missing.length) {
    return NextResponse.json(
      { error: `Vul eerst je afzendergegevens in .env.local: ${missing.join(', ')}.` },
      { status: 422 },
    );
  }

  const website = sender.website.startsWith('http') ? sender.website : `https://${sender.website}`;
  const qrSvg = (
    await QRCode.toString(website, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 72,
    })
  ).replace(/#000000/g, '#14594A');

  let html: string | null = null;
  let variant: 'personal' | 'generic' = 'generic';
  let reason: string | null = null;
  let companyName = '';

  if (parsed.data.prospectId) {
    const { data: row } = await supabase
      .from('prospects')
      .select(
        'id, own_label, prospect_sources(payload), prospect_signals(key, kind, label, value, confidence, detected_by)',
      )
      .eq('id', parsed.data.prospectId)
      .eq('owner_id', user.id)
      .maybeSingle();

    const sources = row?.prospect_sources as unknown as Array<{ payload: PlaceSummary }> | null;
    const place = sources?.[0]?.payload;

    if (place) {
      companyName = place.name;
      const signals: Signal[] = normalizeStoredSignals(row?.prospect_signals ?? []);
      const readiness = flyerReadiness(signals, place);

      if (readiness.ready) {
        variant = 'personal';
        html = buildFlyerHtml([
          { companyName: place.name, observations: readiness.observations, scanUrl: website, qrSvg, sender },
        ]);
      } else {
        reason = readiness.reason ?? null;
      }
    }
  }

  if (!html) html = buildGenericFlyerHtml(sender, qrSvg);

  try {
    const pdf = await renderPdf(html);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        // inline zodat de browser hem toont in plaats van downloadt
        'Content-Disposition': `inline; filename="flyer-${variant}.pdf"`,
        'X-Flyer-Variant': variant,
        'X-Flyer-Company': encodeURIComponent(companyName),
        'X-Flyer-Reason': encodeURIComponent(reason ?? ''),
      },
    });
  } catch (error) {
    const message = error instanceof RenderError ? error.message : 'Flyer maken mislukt.';
    console.error('[flyer-preview] renderen mislukt', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
