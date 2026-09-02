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
