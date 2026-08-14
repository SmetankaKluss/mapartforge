const encoder = new TextEncoder();

const DEFAULT_ENDPOINT = "https://storage.yandexcloud.net";
const DEFAULT_PREFIX = "cloud/v1";
const DEFAULT_REGION = "ru-central1";
const MAX_PRESIGNED_SECONDS = 15 * 60;
const MAX_LIST_RESPONSE_BYTES = 64 * 1024;
const MAX_DELETE_CONCURRENCY = 3;

type EnvironmentReader = { get(name: string): string | undefined };

export type CompanionArtifactStorageFetcher = typeof fetch;

export type CompanionArtifactYandexConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  prefix: string;
  endpoint: string;
  region: string;
  kmsKeyId: string;
};

export type CompanionArtifactUploadTarget = {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
};

export type CompanionArtifactYandexMethod = "GET" | "HEAD" | "PUT" | "DELETE";

function readEnvironment(
  env: EnvironmentReader,
  name: string,
): string | undefined {
  try {
    return env.get(name);
  } catch {
    return undefined;
  }
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function normalizeEndpoint(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.search || parsed.hash ||
      (parsed.pathname !== "/" && parsed.pathname !== "")
    ) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function isSafeBucketName(value: string): boolean {
  return value.length >= 3 && value.length <= 63 &&
    /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value) && !value.includes("..");
}

function normalizePath(value: string): string {
  const trimmed = trimSlashes(value.trim());
  if (!trimmed || trimmed.length > 2_048 || trimmed.includes("\\")) {
    throw new Error("Companion artifact Yandex path is invalid");
  }
  if (
    Array.from(trimmed).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) throw new Error("Companion artifact Yandex path is invalid");
  const segments = trimmed.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Companion artifact Yandex path is invalid");
  }
  return segments.join("/");
}

function normalizedSha256(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("Companion artifact Yandex SHA-256 is invalid");
  }
  return normalized;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function sha256Text(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmac(key: ArrayBuffer, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodePath(value: string): string {
  return value.split("/").map(awsEncode).join("/");
}

function timestamp(date: Date): { dateStamp: string; amzDate: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { dateStamp: iso.slice(0, 8), amzDate: iso };
}

function canonicalQuery(
  entries: readonly (readonly [string, string])[],
): string {
  return entries
    .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0) ||
      (leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0)
    ))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function companionArtifactYandexWritesEnabled(
  env: EnvironmentReader = Deno.env,
): boolean {
  return readEnvironment(env, "MAPKLUSS_YANDEX_ARTIFACT_STORAGE_WRITE") ===
    "true";
}

export function readCompanionArtifactYandexConfig(
  env: EnvironmentReader = Deno.env,
): CompanionArtifactYandexConfig | null {
  const writesEnabled = companionArtifactYandexWritesEnabled(env);
  const accessKeyId =
    readEnvironment(env, "YANDEX_ARTIFACT_STORAGE_ACCESS_KEY_ID")?.trim() ?? "";
  const secretAccessKey =
    readEnvironment(env, "YANDEX_ARTIFACT_STORAGE_SECRET_ACCESS_KEY")?.trim() ??
      "";
  const bucket =
    readEnvironment(env, "YANDEX_ARTIFACT_STORAGE_BUCKET")?.trim() ?? "";
  const prefix = trimSlashes(
    readEnvironment(env, "YANDEX_ARTIFACT_STORAGE_PREFIX") ?? DEFAULT_PREFIX,
  );
  const endpoint = normalizeEndpoint(
    readEnvironment(env, "YANDEX_ARTIFACT_STORAGE_ENDPOINT") ??
      DEFAULT_ENDPOINT,
  );
  const region =
    readEnvironment(env, "YANDEX_ARTIFACT_STORAGE_REGION")?.trim() ||
    DEFAULT_REGION;
  const kmsKeyId =
    readEnvironment(env, "YANDEX_ARTIFACT_STORAGE_KMS_KEY_ID")?.trim() ?? "";
  const valid = !!accessKeyId && !!secretAccessKey &&
    isSafeBucketName(bucket) &&
    !!prefix && !!endpoint && !!region && !!kmsKeyId;
  if (!valid && writesEnabled) {
    throw new Error(
      "Companion artifact Yandex storage is enabled but its configuration is invalid",
    );
  }
  if (!valid) return null;
  return {
    accessKeyId,
    secretAccessKey,
    bucket,
    prefix,
    endpoint,
    region,
    kmsKeyId,
  };
}

export function companionArtifactYandexObjectKey(
  config: CompanionArtifactYandexConfig,
  sourceBucket: string,
  logicalPath: string,
): string {
  return [
    config.prefix,
    normalizePath(sourceBucket),
    normalizePath(logicalPath),
  ]
    .filter(Boolean)
    .join("/");
}

export async function presignCompanionArtifactYandexRequest(
  config: CompanionArtifactYandexConfig,
  method: CompanionArtifactYandexMethod,
  sourceBucket: string,
  logicalPath: string,
  expiresIn = MAX_PRESIGNED_SECONDS,
  additionalSignedHeaders: Readonly<Record<string, string>> = {},
  now = new Date(),
): Promise<string> {
  const endpoint = new URL(config.endpoint);
  const objectKey = companionArtifactYandexObjectKey(
    config,
    sourceBucket,
    logicalPath,
  );
  const canonicalUri = `/${awsEncode(config.bucket)}/${encodePath(objectKey)}`;
  const { dateStamp, amzDate } = timestamp(now);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const signedHeaderEntries = Object.entries(additionalSignedHeaders).map(
    ([rawName, rawValue]) => {
      const name = rawName.trim().toLowerCase();
      const value = rawValue.trim().replace(/\s+/g, " ");
      if (
        !name || name === "host" || !/^[a-z0-9-]+$/.test(name) ||
        /[\r\n]/.test(rawValue)
      ) {
        throw new Error("Companion artifact Yandex signed header is invalid");
      }
      return [name, value] as const;
    },
  ).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const signedHeaders = ["host", ...signedHeaderEntries.map(([name]) => name)]
    .join(";");
  const canonicalHeaders = [
    `host:${endpoint.host}`,
    ...signedHeaderEntries.map(([name, value]) => `${name}:${value}`),
  ].join("\n") + "\n";
  const entries: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    [
      "X-Amz-Expires",
      String(
        Math.max(1, Math.min(MAX_PRESIGNED_SECONDS, Math.floor(expiresIn))),
      ),
    ],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];
  const query = canonicalQuery(entries);
  const canonicalRequest = [
    method,
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Text(canonicalRequest),
  ].join("\n");
  const initialKey = encoder.encode(`AWS4${config.secretAccessKey}`)
    .buffer as ArrayBuffer;
  const dateKey = await hmac(initialKey, dateStamp);
  const regionKey = await hmac(dateKey, config.region);
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));
  return `${endpoint.origin}${canonicalUri}?${query}&X-Amz-Signature=${signature}`;
}

async function presignCompanionArtifactYandexListRequest(
  config: CompanionArtifactYandexConfig,
  objectKey: string,
  now = new Date(),
): Promise<string> {
  const endpoint = new URL(config.endpoint);
  const { dateStamp, amzDate } = timestamp(now);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const signedHeaders = "host";
  const canonicalHeaders = `host:${endpoint.host}\n`;
  const query = canonicalQuery([
    ["list-type", "2"],
    ["max-keys", "1"],
    ["prefix", objectKey],
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", "60"],
    ["X-Amz-SignedHeaders", signedHeaders],
  ]);
  const canonicalUri = `/${awsEncode(config.bucket)}`;
  const canonicalRequest = [
    "GET",
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Text(canonicalRequest),
  ].join("\n");
  const initialKey = encoder.encode(`AWS4${config.secretAccessKey}`)
    .buffer as ArrayBuffer;
  const dateKey = await hmac(initialKey, dateStamp);
  const regionKey = await hmac(dateKey, config.region);
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));
  return `${endpoint.origin}${canonicalUri}?${query}&X-Amz-Signature=${signature}`;
}

async function readBoundedResponseText(
  response: Response,
  maximum: number,
): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) {
    throw new Error("Companion artifact Yandex list response is too large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximum) {
        await reader.cancel();
        throw new Error("Companion artifact Yandex list response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

function decodeXmlText(value: string): string {
  return value.replace(
    /&(lt|gt|amp|quot|apos|#\d+|#x[\da-fA-F]+);/g,
    (entity) => {
      const body = entity.slice(1, -1);
      if (body === "lt") return "<";
      if (body === "gt") return ">";
      if (body === "amp") return "&";
      if (body === "quot") return '"';
      if (body === "apos") return "'";
      const radix = body.startsWith("#x") ? 16 : 10;
      const digits = body.slice(radix === 16 ? 2 : 1);
      const codePoint = Number.parseInt(digits, radix);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 &&
          codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    },
  );
}

async function companionArtifactYandexObjectExists(
  config: CompanionArtifactYandexConfig,
  sourceBucket: string,
  logicalPath: string,
  fetcher: CompanionArtifactStorageFetcher,
): Promise<boolean> {
  const objectKey = companionArtifactYandexObjectKey(
    config,
    sourceBucket,
    logicalPath,
  );
  const listUrl = await presignCompanionArtifactYandexListRequest(
    config,
    objectKey,
  );
  const response = await fetcher(listUrl, {
    method: "GET",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(
      `Companion artifact Yandex list failed with HTTP ${response.status}`,
    );
  }
  const xml = await readBoundedResponseText(
    response,
    MAX_LIST_RESPONSE_BYTES,
  );
  for (const match of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)) {
    if (decodeXmlText(match[1]) === objectKey) return true;
  }
  return false;
}

export async function createCompanionArtifactUploadTarget(
  config: CompanionArtifactYandexConfig,
  artifact: {
    bucketId: string;
    storagePath: string;
    contentType: string;
    sha256: string;
  },
  now = new Date(),
): Promise<CompanionArtifactUploadTarget> {
  const sha256 = normalizedSha256(artifact.sha256);
  const headers = {
    "content-type": artifact.contentType,
    "if-none-match": "*",
    "x-amz-meta-sha256": sha256,
    "x-amz-meta-source-bucket": normalizePath(artifact.bucketId),
    "x-amz-server-side-encryption": "aws:kms",
    "x-amz-server-side-encryption-aws-kms-key-id": config.kmsKeyId,
  };
  return {
    method: "PUT",
    url: await presignCompanionArtifactYandexRequest(
      config,
      "PUT",
      artifact.bucketId,
      artifact.storagePath,
      MAX_PRESIGNED_SECONDS,
      headers,
      now,
    ),
    headers,
  };
}

export async function signCompanionArtifactYandexDownload(
  config: CompanionArtifactYandexConfig,
  sourceBucket: string,
  logicalPath: string,
  expiresIn = 60 * 30,
  now = new Date(),
): Promise<string> {
  return presignCompanionArtifactYandexRequest(
    config,
    "GET",
    sourceBucket,
    logicalPath,
    expiresIn,
    {},
    now,
  );
}

export async function removeCompanionArtifactYandexObjects(
  config: CompanionArtifactYandexConfig,
  rows: readonly { bucketId: string; storagePath: string }[],
  fetcher: CompanionArtifactStorageFetcher = fetch,
): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (
    let offset = 0;
    offset < rows.length;
    offset += MAX_DELETE_CONCURRENCY
  ) {
    await Promise.all(
      rows.slice(offset, offset + MAX_DELETE_CONCURRENCY).map(async (row) => {
        try {
          const url = await presignCompanionArtifactYandexRequest(
            config,
            "DELETE",
            row.bucketId,
            row.storagePath,
            60,
          );
          const response = await fetcher(url, {
            method: "DELETE",
            signal: AbortSignal.timeout(5_000),
          });
          if (response.status === 404) {
            removed += 1;
            return;
          }
          if (!response.ok) {
            failed += 1;
            return;
          }

          const exists = await companionArtifactYandexObjectExists(
            config,
            row.bucketId,
            row.storagePath,
            fetcher,
          );
          if (!exists) removed += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }),
    );
  }
  return { removed, failed };
}
