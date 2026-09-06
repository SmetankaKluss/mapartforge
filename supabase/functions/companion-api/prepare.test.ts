import { assert, assertEquals } from 'jsr:@std/assert@1';

Deno.test('real prepare handler preserves the upload integrity contract', async (t) => {
  const environment = {
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    MAPKLUSS_YANDEX_ARTIFACT_STORAGE_WRITE: 'true',
    YANDEX_ARTIFACT_STORAGE_ACCESS_KEY_ID: 'test-access-key',
    YANDEX_ARTIFACT_STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
    YANDEX_ARTIFACT_STORAGE_BUCKET: 'test-artifacts',
    YANDEX_ARTIFACT_STORAGE_KMS_KEY_ID: 'test-kms-key',
  };
  const previousEnvironment = new Map(Object.keys(environment).map(key => [key, Deno.env.get(key)]));
  const originalServe = Deno.serve;
  const originalFetch = globalThis.fetch;
  let handle: ((request: Request) => Promise<Response>) | undefined;
  let rpcCalls = 0;
  let rejectReservation = false;
  let reserved: Record<string, unknown>[] = [];

  try {
    for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value);
    // Capture the production entrypoint without opening a network listener.
    Deno.serve = ((handler: typeof handle) => {
      handle = handler;
      return {};
    }) as unknown as typeof Deno.serve;
    await import('./index.ts');
    Deno.serve = originalServe;
    assert(handle);
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      assertEquals(request.url, 'https://supabase.test/rest/v1/rpc/prepare_companion_art_save');
      assertEquals(request.headers.get('authorization'), 'Bearer test.website.jwt');
      rpcCalls++;
      const payload = await request.json();
      reserved = payload.requested_artifacts;
      return new Response(JSON.stringify(rejectReservation ? { message: 'owner_rejected' } : { prepared: true }), {
        status: rejectReservation ? 403 : 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const artifact = {
      artifactId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      bucketId: 'mapkluss-companion-private',
      storagePath: 'companion/test-owner/test-art/test-version/preview.png',
      contentType: 'image/png', sha256: 'a'.repeat(64), sizeBytes: 3,
    };
    const send = (extra: Record<string, unknown> = {}, authorization = 'Bearer test.website.jwt') => handle!(new Request(
      'https://edge.test/companion-api', {
        method: 'POST', headers: { 'Content-Type': 'application/json', authorization },
        body: JSON.stringify({ action: 'art_save_prepare', artifacts: [{ ...artifact, ...extra }] }),
      },
    ));

    await t.step('marked browser reservation produces signed checksum headers', async () => {
      const response = await send({ integrity: 'yandex-payload-v1', contentMd5: 'kAFQmDzST7DWlj99KOF/cg==' });
      assertEquals(response.status, 200);
      const result = await response.json();
      assertEquals(result.storageProvider, 'yandex');
      assertEquals(reserved[0].integrity, 'yandex-payload-v2');
      const target = result.uploadTargets[0];
      assertEquals(target.headers['content-md5'], 'kAFQmDzST7DWlj99KOF/cg==');
      assertEquals(target.headers['x-amz-content-sha256'], artifact.sha256);
      assertEquals(target.headers['x-amz-meta-integrity'], 'yandex-payload-v2');
      assertEquals(target.headers['if-none-match'], '*');
      assertEquals(new URL(target.url).search, '');
      const signed = target.headers.authorization.split('SignedHeaders=')[1].split(',')[0].split(';');
      for (const header of ['content-md5', 'x-amz-content-sha256', 'x-amz-meta-integrity', 'if-none-match']) {
        assert(signed.includes(header));
      }
    });
    await t.step('legacy client stays on the unmarked upload protocol', async () => {
      const result = await (await send()).json();
      const headers = result.uploadTargets[0].headers;
      assertEquals(headers['x-amz-meta-integrity'], undefined);
      assertEquals(headers['content-md5'], undefined);
      assertEquals(headers['x-amz-content-sha256'], undefined);
    });
    await t.step('client cannot force the trusted marker without a checksum', async () => {
      const result = await (await send({ integrity: 'yandex-payload-v2' })).json();
      assertEquals(reserved[0].integrity, undefined);
      assertEquals(result.uploadTargets[0].headers.authorization, undefined);
    });
    await t.step('rejected ownership never receives an upload URL', async () => {
      rejectReservation = true;
      const response = await send();
      assertEquals(response.status, 422);
      assertEquals((await response.json()).uploadTargets, undefined);
      rejectReservation = false;
    });
    await t.step('missing authentication never reserves storage', async () => {
      const before = rpcCalls;
      assertEquals((await send({}, '')).status, 401);
      assertEquals(rpcCalls, before);
    });
    await t.step('Supabase write rollback does not issue a Yandex URL', async () => {
      Deno.env.set('MAPKLUSS_YANDEX_ARTIFACT_STORAGE_WRITE', 'false');
      const result = await (await send({ integrity: 'yandex-payload-v1', contentMd5: 'kAFQmDzST7DWlj99KOF/cg==' })).json();
      assertEquals(result.storageProvider, 'supabase');
      assertEquals(result.uploadTargets, []);
      assertEquals(reserved[0].storageProvider, 'supabase');
    });
  } finally {
    globalThis.fetch = originalFetch;
    Deno.serve = originalServe;
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
