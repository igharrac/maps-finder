/**
 * Eén plek waar omgevingsvariabelen gelezen en gecontroleerd worden, zodat een
 * ontbrekende sleutel een duidelijke fout geeft in plaats van een lege kaart.
 *
 * De serversleutel wordt bewust alleen via serverEnv() gelezen. Die functie mag
 * nooit vanuit een client component aangeroepen worden.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Omgevingsvariabele ${name} ontbreekt. Kopieer .env.example naar .env.local en vul hem in.`,
    );
  }
  return value;
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  mapsBrowserKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? '',
  mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
};

export function serverEnv() {
  return {
    placesKey: required('GOOGLE_PLACES_SERVER_KEY', process.env.GOOGLE_PLACES_SERVER_KEY),
  };
}
