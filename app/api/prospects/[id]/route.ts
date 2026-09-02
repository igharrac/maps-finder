import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { PROSPECT_STATUSES } from '@/lib/types';

const patchSchema = z.object({ status: z.enum(PROSPECT_STATUSES) });

/** Wijzigt de status van een prospect. */
export async function PATCH(
  request: Request,
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Onbekende status.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('prospects')
    .update({ status: parsed.data.status })
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('id, status')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Bijwerken mislukt.' }, { status: 404 });
  }

  return NextResponse.json(data);
}

/**
 * Verwijdert een prospect volledig.
 *
 * Bewust geweigerd zodra er contact is geweest. De hele reden dat we prospects
 * bewaren is dat je niet per ongeluk hetzelfde bedrijf twee keer benadert; wie
 * een bezorgde flyer weggooit, gooit precies die bescherming weg. Voor "dit
 * bedrijf is niks" is afwijzen de juiste actie — dan blijft het bekend.
 */
export async function DELETE(
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

  const { count } = await supabase
    .from('outreach_events')
    .select('id', { count: 'exact', head: true })
    .eq('prospect_id', id)
    .eq('owner_id', user.id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          'Dit bedrijf is al benaderd. Verwijderen zou die geschiedenis wissen, ' +
          'waardoor je het later opnieuw kunt benaderen. Wijs het af in plaats daarvan.',
        suggestion: 'rejected',
      },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from('prospects')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id);

  if (error) {
    console.error('[prospects] verwijderen mislukt', error);
    return NextResponse.json({ error: 'Verwijderen mislukt.' }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
