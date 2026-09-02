import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { z } from 'zod';
import { flyerReadiness } from '@/lib/flyer/observations';
import { RenderError, renderPdf } from '@/lib/flyer/render';
import { senderFromEnv } from '@/lib/flyer/sender';
import { buildFlyerHtml, type FlyerData } from '@/lib/flyer/template';
import type { PlaceSummary } from '@/lib/places/types';
import type { Signal } from '@/lib/scoring/signals';
import { createClient } from '@/lib/supabase/server';
import { generateTrackingCode } from '@/lib/tracking';

export const maxDuration = 60;

const bodySchema = z.object({
  prospectIds: z.array(z.string().uuid()).min(1).max(50),
  campaignId: z.string().uuid().nullable().optional(),
  interleave: z.boolean().optional(),
});

type Skipped = { prospectId: string; name: string; reason: string };

/**
 * Genereert gepersonaliseerde flyers als één PDF.
 *
 * Een prospect wordt overgeslagen als er te weinig concreets over te zeggen
 * valt. Dat is bewust streng: liever een generieke flyer dan een gedrukte
 * bewering die niet klopt.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 });
  }

  const { sender, missing } = senderFromEnv();
  if (missing.length) {
    return NextResponse.json(
      {
        error: `Vul eerst je afzendergegevens in .env.local: ${missing.join(', ')}.`,
      },
      { status: 422 },
    );
  }

  const { prospectIds, campaignId, interleave } = parsed.data;
  const scanBase = (process.env.FLYER_SCAN_BASE_URL ?? '').replace(/\/$/, '');

  const { data: rows, error } = await supabase
    .from('prospects')
    .select('id, own_label, prospect_sources(payload), prospect_signals(key, kind, label, value, confidence, detected_by)')
    .eq('owner_id', user.id)
    .in('id', prospectIds);

  if (error || !rows) {
    console.error('[flyers] ophalen mislukt', error);
    return NextResponse.json({ error: 'Prospects ophalen mislukt.' }, { status: 500 });
  }

  const flyers: FlyerData[] = [];
  const skipped: Skipped[] = [];

  for (const row of rows) {
    const sources = row.prospect_sources as unknown as Array<{ payload: PlaceSummary }> | null;
    const place = sources?.[0]?.payload;
    const name = place?.name ?? row.own_label ?? 'Onbekend bedrijf';

    if (!place) {
      skipped.push({
        prospectId: row.id,
        name,
        reason: 'Brongegevens verlopen — zoek het bedrijf opnieuw op.',
      });
      continue;
    }

    const signals = ((row.prospect_signals ?? []) as unknown as Array<{
      key: string;
      kind: Signal['kind'];
      label: string;
      value: unknown;
      confidence: number;
      detected_by: string;
    }>).map<Signal>((s) => ({
      key: s.key,
      kind: s.kind,
      label: s.label,
      value: s.value,
      normalized: null,
      confidence: s.confidence,
      detectedBy: s.detected_by,
    }));

    // normalized wordt niet opgeslagen; voor de flyer leiden we het terug af uit
    // de waarde, want alleen het ontbreken van iets is de moeite van drukken waard.
    for (const signal of signals) {
      const v = signal.value as Record<string, unknown> | null;
      if (signal.key === 'has_request_form') {
        signal.normalized = v && v.formCount && v.matchedKeyword ? 1 : 0;
      } else if (signal.key === 'mobile_friendly') {
        signal.normalized = v && v.hasViewport ? 1 : 0;
      } else if (signal.key === 'shows_reviews') {
        signal.normalized = v && v.marker ? 1 : 0;
      } else if (signal.key === 'https') {
        signal.normalized = typeof v?.url === 'string' && v.url.startsWith('https://') ? 1 : 0;
      } else if (signal.key === 'site_reachable') {
        signal.normalized = v && typeof v.status === 'number' && v.status >= 200 && v.status < 400 ? 1 : 0;
      }
    }

    const readiness = flyerReadiness(signals, place);
    if (!readiness.ready) {
      skipped.push({ prospectId: row.id, name, reason: readiness.reason ?? 'Niet geschikt.' });
      continue;
    }

    // Bestaande code hergebruiken, zodat een herdruk dezelfde QR houdt.
    const { data: existing } = await supabase
      .from('tracking_codes')
      .select('code')
      .eq('prospect_id', row.id)
      .is('revoked_at', null)
      .limit(1)
      .maybeSingle();

    let code = existing?.code;
    if (!code) {
      code = generateTrackingCode();
      const { error: codeError } = await supabase.from('tracking_codes').insert({
        owner_id: user.id,
        code,
        prospect_id: row.id,
        campaign_id: campaignId ?? null,
      });
      if (codeError) {
        skipped.push({ prospectId: row.id, name, reason: 'Trackingcode aanmaken mislukt.' });
        continue;
      }
    }

    const scanUrl = `${scanBase}/scan/${code}`;
    const qrSvg = await QRCode.toString(scanUrl, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 76,
    });

    flyers.push({
      companyName: name,
      observations: readiness.observations,
      scanUrl,
      qrSvg: qrSvg.replace(/#000000/g, '#14594A'),
      sender,
    });
  }

  if (flyers.length === 0) {
    return NextResponse.json(
      {
        error: 'Geen enkel bedrijf had genoeg concrete waarnemingen voor een eigen flyer.',
        skipped,
      },
      { status: 422 },
    );
  }

  try {
    const pdf = await renderPdf(buildFlyerHtml(flyers, { interleave }));

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="flyers-${flyers.length}.pdf"`,
        // De interface leest dit uit om te melden wie is overgeslagen.
        'X-Flyer-Summary': encodeURIComponent(
          JSON.stringify({ generated: flyers.length, skipped }),
        ),
      },
    });
  } catch (renderError) {
    const message =
      renderError instanceof RenderError
        ? renderError.message
        : 'Flyers maken mislukt.';
    console.error('[flyers] renderen mislukt', renderError);
    return NextResponse.json({ error: message, skipped }, { status: 500 });
  }
}
