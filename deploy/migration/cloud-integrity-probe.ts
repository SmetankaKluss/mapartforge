import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  createCompanionArtifactUploadTarget,
  readCompanionArtifactYandexConfig,
  companionArtifactYandexObjectKey,
  signCompanionArtifactYandexDownload,
  signCompanionArtifactYandexHead,
} from '../../supabase/functions/_shared/companionArtifactYandexStorage.ts';
import {
  verifyCompanionArtifactResponse,
  verifyCompanionArtifactYandexHeadResponse,
  type ReservedCompanionArtifact,
} from '../../supabase/functions/_shared/companionSaveVerification.ts';

const proofExpiresAt = /* DEPLOY_EXPIRY */0;

// Temporary service-only proof. No client input, database rows or user files.
Deno.serve(async request => {
  if (Date.now() > proofExpiresAt) return new Response(null, { status: 410 });
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const provided = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!expected || !provided || !timingSafeEqual(
    createHash('sha256').update(expected).digest(),
    createHash('sha256').update(provided).digest(),
  )) return new Response(null, { status: 401 });
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const config = readCompanionArtifactYandexConfig();
  if (!config) return Response.json({ ok: false, stage: 'configuration' }, { status: 503 });
  const run = crypto.randomUUID();
  const bytes = new Uint8Array(65536).map((_, index) => (index * 31) % 251);
  const contentMd5 = createHash('md5').update(bytes).digest('base64');
  const rows: ReservedCompanionArtifact[] = ['marked', 'legacy'].map(name => ({
    artifactId: crypto.randomUUID(), kind: 'project', filename: `${name}.bin`,
    bucketId: 'mapkluss-companion-private', storagePath: `qa/integrity-probe/${run}/${name}.bin`,
    contentType: 'application/octet-stream', sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), storageProvider: 'yandex',
    ...(name === 'marked' ? { integrity: 'yandex-payload-v1' as const, contentMd5 } : {}),
  }));
  let stage = 'start';
  const checks: Record<string, boolean> = {};
  const timings: Record<string, number> = {};
  const send: typeof fetch = (input, init = {}) => fetch(input, {
    ...init, signal: AbortSignal.timeout(15000),
  });
  let ok = false;
  try {
    for (const row of rows) {
      const marked = !!row.integrity;
      const name = marked ? 'marked' : 'legacy';
      const target = await createCompanionArtifactUploadTarget(config, {
        ...row, integrity: marked ? { contentMd5 } : undefined,
      });
      if (marked) {
        stage = 'browser_cors';
        const cors = await send(target.url, { method: 'OPTIONS', headers: {
          Origin: 'https://mapkluss.art', 'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': Object.keys(target.headers).sort().join(','),
        } });
        const allowed = cors.headers.get('access-control-allow-origin');
        const methods = (cors.headers.get('access-control-allow-methods') ?? '').toUpperCase().split(/\s*,\s*/);
        const headers = (cors.headers.get('access-control-allow-headers') ?? '').toLowerCase().split(/\s*,\s*/);
        checks.browser_cors = cors.ok && (allowed === '*' || allowed === 'https://mapkluss.art')
          && methods.includes('PUT') && Object.keys(target.headers).every(header => headers.includes('*') || headers.includes(header.toLowerCase()));
        await cors.body?.cancel();
        if (!checks.browser_cors) throw new Error(stage);
        stage = 'changed_payload';
        const changed = bytes.slice();
        changed[0] ^= 1;
        // A matching MD5 cannot excuse a mismatched signed SHA-256 payload.
        const wrongTarget = await createCompanionArtifactUploadTarget(config, {
          ...row, integrity: { contentMd5: createHash('md5').update(changed).digest('base64') },
        });
        const rejected = await send(wrongTarget.url, { method: 'PUT', headers: wrongTarget.headers, body: changed });
        checks.changed_payload_rejected = [400, 403].includes(rejected.status);
        await rejected.body?.cancel();
        if (!checks.changed_payload_rejected) throw new Error('changed_payload');
      }
      stage = `${name}_put`;
      let started = performance.now();
      const upload = await send(target.url, { method: 'PUT', headers: { ...target.headers, Origin: 'https://mapkluss.art' }, body: bytes });
      checks[stage] = upload.ok;
      checks[`${name}_response_cors`] = ['*', 'https://mapkluss.art'].includes(upload.headers.get('access-control-allow-origin') ?? '');
      await upload.body?.cancel();
      if (!checks[stage]) throw new Error(stage);
      timings[stage] = Math.round(performance.now() - started);
      stage = `${name}_verify`;
      started = performance.now();
      if (marked) {
        const head = await send(await signCompanionArtifactYandexHead(config, row.bucketId, row.storagePath), { method: 'HEAD' });
        verifyCompanionArtifactYandexHeadResponse(row, head);
        checks.kms = head.headers.get('x-amz-server-side-encryption') === 'aws:kms';
      } else {
        await verifyCompanionArtifactResponse(row, await send(await signCompanionArtifactYandexDownload(config, row.bucketId, row.storagePath)));
      }
      checks[stage] = true;
      timings[stage] = Math.round(performance.now() - started);
      stage = `${name}_immutable`;
      const repeated = await send(target.url, { method: 'PUT', headers: target.headers, body: bytes });
      checks[stage] = repeated.status === 412;
      await repeated.body?.cancel();
      if (!checks[stage]) throw new Error(stage);
    }
    ok = Object.values(checks).every(Boolean);
  } catch {
    checks[stage] = false;
  } finally {
    const aws = new AwsClient({ ...config, service: 's3', retries: 0 });
    checks.cleanup = true;
    for (const row of rows) {
      let empty = false;
      try {
        const objectUrl = new URL(config.endpoint);
        objectUrl.pathname = '/' + [config.bucket, ...companionArtifactYandexObjectKey(config, row.bucketId, row.storagePath).split('/')].map(encodeURIComponent).join('/');
        for (let attempt = 0; attempt < 4; attempt++) {
          const head = await send(await aws.sign(objectUrl.toString(), { method: 'HEAD' }));
          if (head.status === 404) { empty = true; break; }
          const version = head.headers.get('x-amz-version-id');
          if (!head.ok || !version) break;
          const versionUrl = new URL(objectUrl);
          versionUrl.searchParams.set('versionId', version);
          const removed = await send(await aws.sign(versionUrl.toString(), { method: 'DELETE' }));
          await removed.body?.cancel();
          if (!removed.ok) break;
        }
      } catch { empty = false; }
      checks.cleanup &&= empty;
    }
  }
  return Response.json({ ok: ok && checks.cleanup, stage, checks, timings }, {
    status: ok && checks.cleanup ? 200 : 422,
    headers: { 'Cache-Control': 'no-store' },
  });
});
