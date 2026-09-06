import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const project = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const run = process.env.GITHUB_RUN_ID;
const attempt = process.env.GITHUB_RUN_ATTEMPT;
const temp = process.env.RUNNER_TEMP;
if (!project || !/^[a-z0-9]+$/.test(project) || !token || !/^\d+$/.test(run ?? '') || !/^\d+$/.test(attempt ?? '') || !temp) {
  throw new Error('Missing proof configuration');
}
const slug = `cloud-proof-${run}-${attempt}`;
const marker = join(temp, `${slug}.owned`);
const management = `https://api.supabase.com/v1/projects/${project}`;
const api = (path, method = 'GET') => fetch(`${management}${path}`, {
  method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
});
async function cleanup() {
  let owned;
  try { owned = await readFile(marker, 'utf8'); } catch { return; }
  if (owned !== slug) throw new Error('Proof ownership marker mismatch');
  const response = await api(`/functions/${slug}`, 'DELETE');
  if (!response.ok && response.status !== 404) throw new Error('Temporary proof cleanup failed');
  await rm(marker);
  console.log(JSON.stringify({ temporaryFunctionRemoved: true }));
}
if (process.argv.includes('--cleanup')) {
  await cleanup();
} else {
  let directory;
  try {
    const existing = await api(`/functions/${slug}`);
    if (existing.status !== 404) throw new Error('Proof identity is already occupied or unavailable');
    directory = await mkdtemp(join(temp, 'mapkluss-proof-'));
    const target = join(directory, 'supabase/functions', slug);
    const shared = join(directory, 'supabase/functions/_shared');
    await mkdir(target, { recursive: true });
    await mkdir(shared, { recursive: true });
    let source = await readFile('deploy/migration/cloud-integrity-probe.ts', 'utf8');
    source = source.replaceAll('../../supabase/functions/_shared/', '../_shared/');
    source = source.replace('/* DEPLOY_EXPIRY */0', String(Date.now() + 15 * 60 * 1000));
    const proofToken = randomBytes(32).toString('hex');
    source = source.replace('DEPLOY_TOKEN_HASH', createHash('sha256').update(proofToken).digest('hex'));
    await writeFile(join(target, 'index.ts'), source);
    for (const name of ['companionArtifactYandexStorage.ts', 'companionSaveVerification.ts']) {
      await writeFile(join(shared, name), await readFile(`supabase/functions/_shared/${name}`));
    }
    await writeFile(join(directory, 'supabase/config.toml'), 'project_id = "mapkluss-proof"\n');
    await writeFile(marker, slug, { flag: 'wx', mode: 0o600 });
    try {
      execFileSync('npx', ['--yes', 'supabase@2.109.1', 'functions', 'deploy', slug,
        '--project-ref', project, '--use-api', '--workdir', directory], { stdio: 'pipe', timeout: 120000 });
    } catch { throw new Error('Temporary proof deployment failed'); }
    const endpoint = `https://${project}.supabase.co/functions/v1/${slug}`;
    const anonymous = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(15000) });
    if (anonymous.status !== 401) throw new Error('Proof authentication guard failed');
    await anonymous.body?.cancel();
    const keyResponse = await api('/api-keys');
    if (!keyResponse.ok) throw new Error('Proof credential lookup failed');
    const keys = await keyResponse.json();
    const key = keys.find(value => value.name === 'service_role')?.api_key;
    if (!key) throw new Error('Proof credential unavailable');
    const response = await fetch(endpoint, { method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'x-proof-token': proofToken }, signal: AbortSignal.timeout(180000) });
    console.log(JSON.stringify({ proofHttpStatus: response.status }));
    const result = await response.json().catch(() => ({ ok: false }));
    const safe = { ok: result.ok === true, checks: {}, timings: {} };
    for (const name of ['changed_payload_rejected', 'changed_payload', 'marked_put', 'marked_verify', 'kms',
      'marked_immutable', 'browser_cors', 'cors_http', 'cors_origin', 'cors_method', 'cors_headers', 'marked_response_cors', 'legacy_response_cors', 'legacy_put', 'legacy_verify', 'legacy_immutable', 'cleanup']) {
      if (typeof result.checks?.[name] === 'boolean') safe.checks[name] = result.checks[name];
      if (Number.isFinite(result.timings?.[name])) safe.timings[name] = result.timings[name];
    }
    console.log(JSON.stringify(safe));
    if (!response.ok || !result.ok) throw new Error('Provider integrity proof did not pass');
  } finally {
    await cleanup();
    if (directory) await rm(directory, { recursive: true });
  }
}
