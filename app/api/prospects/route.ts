import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { PROSPECT_STATUSES } from '@/lib/types';

const placeSchema = z.object({
  placeId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  primaryType: z.string().nullable(),
  categoryLabel: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().nullable(),
  websiteUri: z.string().nullable(),
  businessStatus: z.string().nullable(),
});

const bodySchema = z.object({
  place: placeSchema,
  status: z.enum(PROSPECT_STATUSES).default('saved'),
  score: z
    .object({
      modelVersion: z.string(),
      opportunityScore: z.number(),
      businessPotential: z.number(),
      digitalMaturity: z.number(),
      weights: z.unknown(),
      signals: z.array(
        z.object({
          key: z.string(),
          kind: z.enum(['fact', 'inference', 'recommendation']),
          label: z.string(),
          value: z.unknown(),
          confidence: z.number(),
          detectedBy: z.string(),
        }),
      ),
    })
    .optional(),
});

/** Duur van de bewaartermijn voor Google-brondata. */
const SOURCE_TTL_DAYS = 30;

/**
 * Slaat een bedrijf op als prospect.
 *
 * De verdeling is bewust strikt: prospects bevat alleen onze eigen gegevens plus
 * het place_id, alle Google-velden gaan naar prospect_sources met een
 * vervaldatum van 30 dagen.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ongeldige prospectgegevens.', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { place, status, score } = parsed.data;

  const { data: prospect, error: prospectError } = await supabase
    .from('prospects')
    .upsert(
      {
        owner_id: user.id,
        google_place_id: place.placeId,
        own_label: place.name,
        status,
      },
      { onConflict: 'owner_id,google_place_id' },
    )
    .select('id, status')
    .single();

  if (prospectError || !prospect) {
    console.error('[prospects] opslaan mislukt', prospectError);
    return NextResponse.json({ error: 'Opslaan mislukt.' }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + SOURCE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const { error: sourceError } = await supabase.from('prospect_sources').upsert(
    {
      prospect_id: prospect.id,
      source: 'google_places',
      source_ref: place.placeId,
      payload: place,
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'prospect_id,source' },
  );

  if (sourceError) {
    console.error('[prospects] brondata opslaan mislukt', sourceError);
  }

  if (score) {
    await supabase.from('prospect_scores').upsert(
      {
        prospect_id: prospect.id,
        model_version: score.modelVersion,
        opportunity_score: Math.round(score.opportunityScore),
        business_potential: Math.round(score.businessPotential),
        digital_maturity: Math.round(score.digitalMaturity),
        weights: score.weights,
      },
      { onConflict: 'prospect_id,model_version' },
    );

    if (score.signals.length) {
      await supabase.from('prospect_signals').upsert(
        score.signals.map((signal) => ({
          prospect_id: prospect.id,
          key: signal.key,
          kind: signal.kind,
          label: signal.label,
          value: signal.value === undefined ? null : signal.value,
          confidence: signal.confidence,
          detected_by: signal.detectedBy,
        })),
        { onConflict: 'prospect_id,key' },
      );
    }
  }

  return NextResponse.json({ prospectId: prospect.id, status: prospect.status });
}
