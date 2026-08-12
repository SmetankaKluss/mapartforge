import type { PreviewSigningResult } from './companionPreviewBatch.ts';

const encoder = new TextEncoder();

export type YandexStorageReadConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  targetBucket: string;
  targetPrefix: string;
  endpoint: string;
  region: string;
};

type EnvironmentReader = { get(name: string): string | undefined };

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function hmac(key: ArrayBuffer, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value));
}

function encodePath(value: string): string {
  return value.split('/').map(segment => encodeURIComponent(segment).replace(
    /[!'()*]/g,
    character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )).join('/');
}

function timestamp(date: Date): { dateStamp: string; amzDate: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { dateStamp: iso.slice(0, 8), amzDate: iso };
}

export function readYandexStorageConfig(
  env: EnvironmentReader = Deno.env,
): YandexStorageReadConfig | null {
  const read = (name: string): string | undefined => {
    try {
      return env.get(name);
    } catch {
      return undefined;
    }
  };
  if (read('MAPKLUSS_YANDEX_STORAGE_DUAL_READ') !== 'true') return null;
  const accessKeyId = read('YANDEX_STORAGE_ACCESS_KEY_ID')?.trim() ?? '';
  const secretAccessKey = read('YANDEX_STORAGE_SECRET_ACCESS_KEY')?.trim() ?? '';
  const targetBucket = read('YANDEX_STORAGE_BUCKET')?.trim() ?? '';
  if (!accessKeyId || !secretAccessKey || !targetBucket) return null;
  return {
    accessKeyId,
    secretAccessKey,
    targetBucket,
    targetPrefix: trimSlashes(read('YANDEX_STORAGE_PREFIX') ?? 'storage-migration/v1'),
    endpoint: (read('YANDEX_STORAGE_ENDPOINT') ?? 'https://storage.yandexcloud.net').replace(/\/+$/, ''),
    region: read('YANDEX_STORAGE_REGION') ?? 'ru-central1',
  };
}

export function yandexObjectKey(config: YandexStorageReadConfig, sourceBucket: string, path: string): string {
  return [config.targetPrefix, trimSlashes(sourceBucket), trimSlashes(path)]
    .filter(Boolean)
    .join('/');
}

export async function presignYandexObject(
  config: YandexStorageReadConfig,
  sourceBucket: string,
  path: string,
  expiresIn: number,
  method: 'GET' | 'HEAD' = 'GET',
  now = new Date(),
): Promise<string> {
  const endpoint = new URL(config.endpoint);
  const objectKey = yandexObjectKey(config, sourceBucket, path);
  const canonicalUri = `/${encodeURIComponent(config.targetBucket)}/${encodePath(objectKey)}`;
  const { dateStamp, amzDate } = timestamp(now);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.max(1, Math.min(604800, Math.floor(expiresIn)))),
    'X-Amz-SignedHeaders': 'host',
  });
  query.sort();
  const canonicalHeaders = `host:${endpoint.host}\n`;
  const canonicalRequest = [
    method,
    canonicalUri,
    query.toString(),
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join('\n');
  const initialKey = encoder.encode(`AWS4${config.secretAccessKey}`).buffer as ArrayBuffer;
  const dateKey = await hmac(initialKey, dateStamp);
  const regionKey = await hmac(dateKey, config.region);
  const serviceKey = await hmac(regionKey, 's3');
  const signingKey = await hmac(serviceKey, 'aws4_request');
  query.set('X-Amz-Signature', hex(await hmac(signingKey, stringToSign)));
  return `${endpoint.origin}${canonicalUri}?${query.toString()}`;
}

export async function signAvailableYandexObjects(
  config: YandexStorageReadConfig,
  sourceBucket: string,
  paths: readonly string[],
  expiresIn: number,
  fetcher: typeof fetch = fetch,
): Promise<PreviewSigningResult[]> {
  return Promise.all(paths.map(async path => {
    try {
      const probeUrl = await presignYandexObject(config, sourceBucket, path, 30, 'HEAD');
      const response = await fetcher(probeUrl, { method: 'HEAD', signal: AbortSignal.timeout(750) });
      if (!response.ok) return { path, error: `target_${response.status}` };
      return {
        path,
        signedUrl: await presignYandexObject(config, sourceBucket, path, expiresIn),
      };
    } catch {
      return { path, error: 'target_unavailable' };
    }
  }));
}
