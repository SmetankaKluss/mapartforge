import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://opxgnyadxybceldaokdi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9weGdueWFkeHliY2VsZGFva2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDU5MjEsImV4cCI6MjA4OTYyMTkyMX0.80IIx_1WGuUtxJlfu7qhOAQKdEb0FwEV8gD5ybe8DcQ',
);
