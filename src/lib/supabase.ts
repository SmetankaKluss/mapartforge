import { createClient } from '@supabase/supabase-js';

const PUBLIC_SUPABASE_URL = 'https://opxgnyadxybceldaokdi.supabase.co';
const PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9weGdueWFkeHliY2VsZGFva2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDU5MjEsImV4cCI6MjA4OTYyMTkyMX0.80IIx_1WGuUtxJlfu7qhOAQKdEb0FwEV8gD5ybe8DcQ';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}
