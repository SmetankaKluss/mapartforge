import {
  presignYandexObject,
  readYandexStorageConfig,
  signAvailableYandexObjects,
  yandexObjectKey,
  type YandexStorageReadConfig,
} from './yandexStorageSigning.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

const config: YandexStorageReadConfig = {
  accessKeyId: 'test-access',
  secretAccessKey: 'test-secret',
  targetBucket: 'private-target',
  targetPrefix: 'storage-migration/v1',
  endpoint: 'https://storage.yandexcloud.net',
  region: 'ru-central1',
};

Deno.test('Yandex dual-read config is disabled unless every required value is present', () => {
  const values = new Map<string, string>([
    ['MAPKLUSS_YANDEX_STORAGE_DUAL_READ', 'true'],
    ['YANDEX_STORAGE_ACCESS_KEY_ID', 'access'],
    ['YANDEX_STORAGE_SECRET_ACCESS_KEY', 'secret'],
    ['YANDEX_STORAGE_BUCKET', 'bucket'],
  ]);
  const loaded = readYandexStorageConfig({ get: key => values.get(key) });
  assert(loaded?.targetBucket === 'bucket');
  values.delete('YANDEX_STORAGE_SECRET_ACCESS_KEY');
  assert(readYandexStorageConfig({ get: key => values.get(key) }) === null);
});

Deno.test('Yandex object keys retain the source bucket namespace', () => {
  assert(
    yandexObjectKey(config, 'mapkluss-companion-private', 'companion/user/preview.png')
      === 'storage-migration/v1/mapkluss-companion-private/companion/user/preview.png',
  );
});

Deno.test('Yandex presigned URL uses short-lived SigV4 query parameters and encoded paths', async () => {
  const url = new URL(await presignYandexObject(
    config,
    'mapartforge',
    'images/folder name/test.png',
    90,
    'GET',
    new Date('2026-08-12T12:34:56.000Z'),
  ));
  assert(url.origin === 'https://storage.yandexcloud.net');
  assert(url.pathname === '/private-target/storage-migration/v1/mapartforge/images/folder%20name/test.png');
  assert(url.searchParams.get('X-Amz-Algorithm') === 'AWS4-HMAC-SHA256');
  assert(url.searchParams.get('X-Amz-Expires') === '90');
  assert(url.searchParams.get('X-Amz-Signature')?.length === 64);
  assert(!url.href.includes('test-secret'));
});

Deno.test('Yandex canonical path escapes every SigV4 reserved punctuation byte', async () => {
  const url = new URL(await presignYandexObject(
    config,
    'mapartforge',
    "images/!'()* %.png",
    60,
    'GET',
    new Date('2026-08-12T12:34:56.000Z'),
  ));
  assert(url.pathname.endsWith('/images/%21%27%28%29%2A%20%25.png'), url.pathname);
  const signature = url.searchParams.get('X-Amz-Signature');
  assert(signature === '5d63301913e6bdc9d711854cb75953ca5279d9a6fbe4f68802fabb2e744f6df0', String(signature));
});

Deno.test('Yandex presigned URL never exceeds the S3 seven-day maximum', async () => {
  const url = new URL(await presignYandexObject(
    config,
    'mapartforge',
    'images/test.png',
    2_592_000,
    'GET',
    new Date('2026-08-12T12:34:56.000Z'),
  ));
  assert(url.searchParams.get('X-Amz-Expires') === '604800');
});

Deno.test('Yandex availability probe only returns download URLs for present objects', async () => {
  const results = await signAvailableYandexObjects(
    config,
    'mapartforge',
    ['present.png', 'missing.png'],
    600,
    async input => new Response(null, {
      status: String(input).includes('present.png') ? 200 : 404,
    }),
  );
  assert(Boolean(results[0].signedUrl));
  assert(!results[0].error);
  assert(!results[1].signedUrl);
  assert(results[1].error === 'target_404');
});
