import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Workspace } from '@/components/workspace/Workspace';
import { publicEnv } from '@/lib/env';

export default async function DiscoverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const missing: string[] = [];
  if (!publicEnv.mapsBrowserKey) missing.push('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY');
  if (!publicEnv.supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');

  return (
    <Workspace
      userEmail={user.email ?? ''}
      mapsApiKey={publicEnv.mapsBrowserKey}
      mapId={publicEnv.mapId}
      missingEnv={missing}
    />
  );
}
