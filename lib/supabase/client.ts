'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/**
 * Supabase-client voor de browser. Gebruikt de publieke sleutel; alle
 * afscherming komt van Row Level Security in de database, niet van deze sleutel.
 */
export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseKey);
}
