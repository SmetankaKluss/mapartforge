import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { selectSupabaseRoute, type SupabaseRoute } from './supabaseRouting';

const PUBLIC_SUPABASE_DIRECT_URL = 'https://opxgnyadxybceldaokdi.supabase.co';
const PUBLIC_SUPABASE_GATEWAY_URL = 'https://api.mapkluss.art';
const PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9weGdueWFkeHliY2VsZGFva2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDU5MjEsImV4cCI6MjA4OTYyMTkyMX0.80IIx_1WGuUtxJlfu7qhOAQKdEb0FwEV8gD5ybe8DcQ';
export const SUPABASE_AUTH_STORAGE_KEY = 'sb-opxgnyadxybceldaokdi-auth-token';

const explicitSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const gatewayUrl = import.meta.env.VITE_SUPABASE_GATEWAY_URL?.trim() || PUBLIC_SUPABASE_GATEWAY_URL;
const directUrl = import.meta.env.VITE_SUPABASE_DIRECT_URL?.trim() || PUBLIC_SUPABASE_DIRECT_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean((explicitSupabaseUrl || directUrl) && supabaseAnonKey);

export let supabase: SupabaseClient | null = null;
let activeRoute: SupabaseRoute | null = null;
let initialization: Promise<SupabaseClient | null> | null = null;

export function initializeSupabase(): Promise<SupabaseClient | null> {
  if (supabase) return Promise.resolve(supabase);
  if (initialization) return initialization;
  if (!isSupabaseConfigured) return Promise.resolve(null);

  initialization = selectSupabaseRoute({
    explicitUrl: explicitSupabaseUrl,
    gatewayUrl,
    directUrl,
  }).then((route) => {
    activeRoute = route;
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.mapklussBackend = route.kind;
    }
    supabase = createClient(route.url, supabaseAnonKey, {
      auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY },
    });
    return supabase;
  });
  return initialization;
}

export function getSupabaseRoute(): SupabaseRoute | null {
  return activeRoute;
}

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase is not initialized. Call initializeSupabase() before rendering the application.');
  }
  return supabase;
}
