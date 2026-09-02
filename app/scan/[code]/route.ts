import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Landingspunt van een QR-code op een flyer.
 *
 * Legt de scan vast en stuurt door. Bewust een redirect en geen pagina: de
 * bezoeker hoort niet te merken dat hier iets gemeten wordt, en op deze URL
 * staat niets dat iets prijsgeeft over het bedrijf of de campagne.
 *
 * De bezoeker is niet ingelogd, dus het vastleggen loopt via record_scan — een
 * databasefunctie met verhoogde rechten die precies één ding kan en niets
 * teruggeeft. Zie migratie 0002. Een onbekende code geeft exact dezelfde
 * doorverwijzing als een geldige.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;

  const destination = process.env.NEXT_PUBLIC_SCAN_REDIRECT_URL;
  const target = destination ? new URL(destination) : new URL('/', request.url);

  if (/^[A-Z0-9]{4,12}$/.test(code)) {
    try {
      const supabase = await createClient();
      await supabase.rpc('record_scan', { p_code: code });
    } catch (error) {
      // Een scan die niet geregistreerd kan worden mag de bezoeker nooit een
      // foutpagina opleveren; die is hier voor iets anders.
      console.error('[scan] vastleggen mislukt', error);
    }
  }

  return NextResponse.redirect(target);
}
