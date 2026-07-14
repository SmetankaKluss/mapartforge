import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://mapkluss.art';

function isLocalDevOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1')
    );
  } catch {
    return false;
  }
}

function allowLocalDevDeviceApprove(): boolean {
  return Deno.env.get('ALLOW_LOCAL_DEV_DEVICE_APPROVE') === 'true';
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function randomToken(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
}

function randomUserCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = '';
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}`;
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function getBearerUserId(admin: ReturnType<typeof createClient>, req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (!error && data.user) return data.user.id;

  const tokenHash = await sha256Hex(token);
  const { data: deviceToken } = await admin
    .from('device_codes')
    .select('user_id,expires_at,status')
    .eq('access_token_hash', tokenHash)
    .eq('status', 'approved')
    .single();
  if (!deviceToken || new Date(deviceToken.expires_at).getTime() < Date.now()) return null;
  return String(deviceToken.user_id);
}

async function getOrCreateLocalDevUser(admin: ReturnType<typeof createClient>, label: string | null) {
  const email = 'local-dev@mapkluss.local';
  const displayName = label?.trim() || 'Local Dev';

  const { data: existingUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = existingUsers?.users?.find(user => user.email?.toLowerCase() === email);
  if (existing) {
    await admin.from('profiles').upsert({
      id: existing.id,
      display_name: displayName,
      updated_at: new Date().toISOString(),
    });
    return existing.id;
  }

  const password = `mapkluss-local-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: displayName,
      name: displayName,
    },
  });
  if (error || !data.user) throw error ?? new Error('local_dev_user_create_failed');

  await admin.from('profiles').upsert({
    id: data.user.id,
    display_name: displayName,
    updated_at: new Date().toISOString(),
  });
  return data.user.id;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'server_not_configured' }, 500);

  const admin = createClient(supabaseUrl, serviceKey);
  const payload = await req.json().catch(() => ({})) as { action?: string; device_code?: string };

  try {
    if (payload.action === 'device_start') {
      const deviceCode = randomToken(32);
      const userCode = randomUserCode();
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const { error } = await admin.from('device_codes').insert({
        device_code: deviceCode,
        user_code: userCode,
        expires_at: expiresAt,
      });
      if (error) throw error;
      return json({
        deviceCode,
        userCode,
        verificationUri: `${SITE_URL.replace(/\/+$/, '')}/device`,
        expiresIn: 600,
        interval: 5,
      });
    }

    if (payload.action === 'device_poll') {
      const deviceCode = String(payload.device_code ?? '');
      const { data, error } = await admin
        .from('device_codes')
        .select('status,user_id,expires_at,access_token_hash')
        .eq('device_code', deviceCode)
        .single();
      if (error || !data) return json({ status: 'expired' });
      if (new Date(data.expires_at).getTime() < Date.now()) {
        await admin.from('device_codes').update({ status: 'expired' }).eq('device_code', deviceCode);
        return json({ status: 'expired' });
      }
      if (data.status !== 'approved') return json({ status: data.status });
      if (!data.user_id) return json({ status: 'pending' });
      if (data.access_token_hash) return json({ status: 'expired' });
      const accessToken = randomToken(48);
      const accessTokenHash = await sha256Hex(accessToken);
      const { data: claimed, error: claimError } = await admin
        .from('device_codes')
        .update({ access_token_hash: accessTokenHash })
        .eq('device_code', deviceCode)
        .is('access_token_hash', null)
        .select('user_id');
      if (claimError) throw claimError;
      if (!claimed || claimed.length === 0) return json({ status: 'expired' });
      return json({ status: 'approved', userId: claimed[0].user_id, accessToken });
    }

    if (payload.action === 'device_approve') {
      const userId = await getBearerUserId(admin, req);
      if (!userId) return json({ error: 'unauthorized' }, 401);

      const userCode = String((payload as { user_code?: string }).user_code ?? '').toUpperCase().trim();
      if (!userCode) return json({ error: 'missing_user_code' }, 400);

      await admin.from('profiles').upsert({ id: userId });
      const { data: updated, error } = await admin
        .from('device_codes')
        .update({
          status: 'approved',
          user_id: userId,
          approved_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
        })
        .eq('user_code', userCode)
        .eq('status', 'pending')
        .select('device_code');
      if (error) throw error;
      if (!updated || updated.length === 0) return json({ error: 'code_not_found_or_already_used' }, 404);
      return json({ ok: true });
    }

    if (payload.action === 'device_approve_dev') {
      if (!allowLocalDevDeviceApprove()) return json({ error: 'dev_approve_disabled' }, 403);

      const origin = req.headers.get('origin') ?? '';
      const referer = req.headers.get('referer') ?? '';
      const localAllowed = isLocalDevOrigin(origin) || isLocalDevOrigin(referer);
      if (!localAllowed) return json({ error: 'dev_approve_localhost_only' }, 403);

      const userCode = String((payload as { user_code?: string }).user_code ?? '').toUpperCase().trim();
      if (!userCode) return json({ error: 'missing_user_code' }, 400);

      const userId = await getOrCreateLocalDevUser(admin, String((payload as { label?: string }).label ?? 'Local Dev'));
      const { data: updated, error } = await admin
        .from('device_codes')
        .update({
          status: 'approved',
          user_id: userId,
          approved_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
        })
        .eq('user_code', userCode)
        .eq('status', 'pending')
        .select('device_code');
      if (error) throw error;
      if (!updated || updated.length === 0) return json({ error: 'code_not_found_or_already_used' }, 404);
      return json({ ok: true, userId });
    }

    return json({ error: 'unsupported_action' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
