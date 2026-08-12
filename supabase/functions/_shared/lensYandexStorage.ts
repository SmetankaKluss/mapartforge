const encoder = new TextEncoder();

const DEFAULT_ENDPOINT = "https://storage.yandexcloud.net";
const DEFAULT_PREFIX = "lens/v1";
const DEFAULT_REGION = "ru-central1";
const LENS_BUCKET_NAMESPACE = "mapkluss-lens";
const MAX_PRESIGNED_SECONDS = 60;
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const MAX_LIST_ITEMS = 1_000;
const MAX_LIST_RESPONSE_BYTES = 2 * 1024 * 1024;
const OBJECT_TRANSFER_TIMEOUT_MS = 20_000;
const METADATA_TIMEOUT_MS = 5_000;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

type EnvironmentReader = { get(name: string): string | undefined };
export type LensStorageFetcher = typeof fetch;

export type LensYandexStorageConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  prefix: string;
  endpoint: string;
  region: string;
};

export type LensPreviewUploadResult = {
  logicalPath: string;
  objectKey: string;
  sha256: string;
  size: number;
  reused: boolean;
};

export type LensYandexRequestMethod = "GET" | "HEAD" | "PUT" | "DELETE";

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
      parsed.search || parsed.hash
    ) {
      return null;
    }
    if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function isSafeBucketName(value: string): boolean {
  return value.length >= 3 && value.length <= 63 &&
    /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value) &&
    !value.includes("..");
}

function normalizeLogicalPath(
  value: string,
  allowTrailingSlash = false,
): string {
  const trimmed = trimSlashes(value.trim());
  if (!trimmed) throw new Error("Lens Yandex logical path is empty");
  if (
    trimmed.length > 2_048 || trimmed.includes("\\") ||
    Array.from(trimmed).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new Error("Lens Yandex logical path is invalid");
  }
  const segments = trimmed.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Lens Yandex logical path is invalid");
  }
  return `${segments.join("/")}${
    allowTrailingSlash && value.trim().endsWith("/") ? "/" : ""
  }`;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes)));
}

async function sha256Text(value: string): Promise<string> {
  return sha256Bytes(encoder.encode(value));
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

function assertPng(bytes: Uint8Array): void {
  if (bytes.length === 0 || bytes.length > MAX_PNG_BYTES) {
    throw new Error("Lens Yandex PNG size is invalid");
  }
  if (PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    throw new Error("Lens Yandex payload is not a PNG");
  }
}

function normalizedSha256(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("Lens Yandex SHA-256 is invalid");
  }
  return normalized;
}

async function readBoundedBytes(
  response: Response,
  maximum: number,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) {
    throw new Error("Lens Yandex response exceeds the allowed size");
  }
  if (!response.body) return new Uint8Array();
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
        throw new Error("Lens Yandex response exceeds the allowed size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
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

export function readLensYandexStorageConfig(
  env: EnvironmentReader = Deno.env,
): LensYandexStorageConfig | null {
  const writesEnabled =
    readEnvironment(env, "MAPKLUSS_YANDEX_LENS_STORAGE") === "true";
  const accessKeyId =
    readEnvironment(env, "YANDEX_LENS_STORAGE_ACCESS_KEY_ID")?.trim() ?? "";
  const secretAccessKey =
    readEnvironment(env, "YANDEX_LENS_STORAGE_SECRET_ACCESS_KEY")?.trim() ?? "";
  const bucket = readEnvironment(env, "YANDEX_LENS_STORAGE_BUCKET")?.trim() ??
    "";
  const prefix = trimSlashes(
    readEnvironment(env, "YANDEX_LENS_STORAGE_PREFIX") ?? DEFAULT_PREFIX,
  );
  const endpoint = normalizeEndpoint(
    readEnvironment(env, "YANDEX_LENS_STORAGE_ENDPOINT") ?? DEFAULT_ENDPOINT,
  );
  const region = readEnvironment(env, "YANDEX_LENS_STORAGE_REGION")?.trim() ||
    DEFAULT_REGION;
  const valid = !!accessKeyId && !!secretAccessKey &&
    isSafeBucketName(bucket) && !!prefix &&
    !!endpoint && !!region;
  if (!valid && writesEnabled) {
    throw new Error(
      "Lens Yandex storage is enabled but its configuration is invalid",
    );
  }
  if (!valid) return null;
  return { accessKeyId, secretAccessKey, bucket, prefix, endpoint, region };
}

export function lensYandexWritesEnabled(
  env: EnvironmentReader = Deno.env,
): boolean {
  return readEnvironment(env, "MAPKLUSS_YANDEX_LENS_STORAGE") === "true";
}

export function lensYandexObjectKey(
  config: LensYandexStorageConfig,
  logicalPath: string,
): string {
  return [
    trimSlashes(config.prefix),
    LENS_BUCKET_NAMESPACE,
    normalizeLogicalPath(logicalPath),
  ]
    .filter(Boolean)
    .join("/");
}

function lensYandexObjectPrefix(
  config: LensYandexStorageConfig,
  logicalPrefix: string,
): string {
  const normalizedPrefix = trimSlashes(logicalPrefix.trim());
  return [
    trimSlashes(config.prefix),
    LENS_BUCKET_NAMESPACE,
    normalizedPrefix ? normalizeLogicalPath(logicalPrefix, true) : "",
  ]
    .filter(Boolean)
    .join("/");
}

export async function presignLensYandexRequest(
  config: LensYandexStorageConfig,
  method: LensYandexRequestMethod,
  logicalPath: string | null,
  expiresIn = MAX_PRESIGNED_SECONDS,
  additionalQuery: Readonly<Record<string, string>> = {},
  now = new Date(),
  additionalSignedHeaders: Readonly<Record<string, string>> = {},
): Promise<string> {
  const endpoint = new URL(config.endpoint);
  const objectKey = logicalPath === null
    ? null
    : lensYandexObjectKey(config, logicalPath);
  const canonicalUri = objectKey === null
    ? `/${awsEncode(config.bucket)}`
    : `/${awsEncode(config.bucket)}/${encodePath(objectKey)}`;
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
        throw new Error("Lens Yandex signed header is invalid");
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
  const entries: [string, string][] = Object.entries(additionalQuery);
  entries.push(
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
  );
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

export async function signLensPreviewDownload(
  config: LensYandexStorageConfig,
  logicalPath: string,
  expiresIn = MAX_PRESIGNED_SECONDS,
  now = new Date(),
): Promise<string> {
  return presignLensYandexRequest(
    config,
    "GET",
    logicalPath,
    expiresIn,
    {},
    now,
  );
}

export async function uploadImmutableLensPreview(
  config: LensYandexStorageConfig,
  logicalPath: string,
  pngBytes: Uint8Array,
  expectedSha256: string,
  fetcher: LensStorageFetcher = fetch,
  now = new Date(),
): Promise<LensPreviewUploadResult> {
  const path = normalizeLogicalPath(logicalPath);
  if (!path.toLowerCase().endsWith(".png")) {
    throw new Error("Lens Yandex preview path must end in .png");
  }
  assertPng(pngBytes);
  const expected = normalizedSha256(expectedSha256);
  if (await sha256Bytes(pngBytes) !== expected) {
    throw new Error("Lens Yandex upload SHA-256 mismatch");
  }

  const immutableHeaders = { "if-none-match": "*" } as const;
  const putUrl = await presignLensYandexRequest(
    config,
    "PUT",
    path,
    MAX_PRESIGNED_SECONDS,
    {},
    now,
    immutableHeaders,
  );
  const uploaded = await fetcher(putUrl, {
    method: "PUT",
    headers: { "content-type": "image/png", "if-none-match": "*" },
    body: ownedArrayBuffer(pngBytes),
    signal: AbortSignal.timeout(OBJECT_TRANSFER_TIMEOUT_MS),
  });
  const alreadyExists = uploaded.status === 409 || uploaded.status === 412;
  if (!uploaded.ok && !alreadyExists) {
    throw new Error(`Lens Yandex upload failed with HTTP ${uploaded.status}`);
  }

  const verifyUrl = await presignLensYandexRequest(
    config,
    "GET",
    path,
    MAX_PRESIGNED_SECONDS,
    {},
    now,
  );
  const verified = await fetcher(verifyUrl, {
    method: "GET",
    signal: AbortSignal.timeout(OBJECT_TRANSFER_TIMEOUT_MS),
  });
  if (!verified.ok) {
    throw new Error(
      `Lens Yandex verification failed with HTTP ${verified.status}`,
    );
  }
  const verifiedBytes = await readBoundedBytes(verified, MAX_PNG_BYTES);
  if (
    verifiedBytes.length !== pngBytes.length ||
    await sha256Bytes(verifiedBytes) !== expected
  ) {
    if (!alreadyExists) {
      try {
        const deleteUrl = await presignLensYandexRequest(
          config,
          "DELETE",
          path,
          MAX_PRESIGNED_SECONDS,
          {},
          now,
        );
        await fetcher(deleteUrl, {
          method: "DELETE",
          signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
        });
      } catch {
        // Preserve the original integrity failure. Cleanup remains best effort here.
      }
    }
    throw new Error(
      alreadyExists
        ? "Lens Yandex immutable object already exists with a different SHA-256"
        : "Lens Yandex post-upload verification failed",
    );
  }
  return {
    logicalPath: path,
    objectKey: lensYandexObjectKey(config, path),
    sha256: expected,
    size: pngBytes.length,
    reused: alreadyExists,
  };
}

export async function listLensPreviewPaths(
  config: LensYandexStorageConfig,
  logicalPrefix: string,
  maximum = MAX_LIST_ITEMS,
  fetcher: LensStorageFetcher = fetch,
  now = new Date(),
  continuationToken?: string,
): Promise<{ paths: string[]; truncated: boolean; nextCursor?: string }> {
  const limit = Math.max(1, Math.min(MAX_LIST_ITEMS, Math.floor(maximum)));
  const objectPrefix = lensYandexObjectPrefix(config, logicalPrefix);
  const listQuery: Record<string, string> = {
    "list-type": "2",
    "max-keys": String(limit),
    prefix: objectPrefix,
  };
  if (continuationToken) listQuery["continuation-token"] = continuationToken;
  const listUrl = await presignLensYandexRequest(
    config,
    "GET",
    null,
    MAX_PRESIGNED_SECONDS,
    listQuery,
    now,
  );
  const response = await fetcher(listUrl, {
    method: "GET",
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Lens Yandex list failed with HTTP ${response.status}`);
  }
  const xml = new TextDecoder().decode(
    await readBoundedBytes(response, MAX_LIST_RESPONSE_BYTES),
  );
  const namespace = `${trimSlashes(config.prefix)}/${LENS_BUCKET_NAMESPACE}/`;
  const paths: string[] = [];
  const matches = xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g);
  for (const match of matches) {
    if (paths.length >= limit) break;
    const key = decodeXmlText(match[1]);
    if (!key.startsWith(namespace)) continue;
    const logicalPath = key.slice(namespace.length);
    try {
      paths.push(normalizeLogicalPath(logicalPath));
    } catch {
      // Ignore malformed or out-of-namespace keys instead of exposing them to cleanup.
    }
  }
  const cursorMatch =
    /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml);
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
  if (truncated && !cursorMatch) {
    throw new Error(
      "Lens Yandex list is truncated without a continuation token",
    );
  }
  return {
    paths,
    truncated,
    ...(cursorMatch ? { nextCursor: decodeXmlText(cursorMatch[1]) } : {}),
  };
}

export async function deleteLensPreviewPaths(
  config: LensYandexStorageConfig,
  logicalPaths: readonly string[],
  fetcher: LensStorageFetcher = fetch,
  now = new Date(),
): Promise<number> {
  if (logicalPaths.length > MAX_LIST_ITEMS) {
    throw new Error("Lens Yandex delete batch is too large");
  }
  let deleted = 0;
  for (let index = 0; index < logicalPaths.length; index += 10) {
    const results = await Promise.all(
      logicalPaths.slice(index, index + 10).map(async (rawPath) => {
        const path = normalizeLogicalPath(rawPath);
        const url = await presignLensYandexRequest(
          config,
          "DELETE",
          path,
          MAX_PRESIGNED_SECONDS,
          {},
          now,
        );
        const response = await fetcher(url, {
          method: "DELETE",
          signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
        });
        if (!response.ok && response.status !== 404) {
          throw new Error(
            `Lens Yandex delete failed with HTTP ${response.status}`,
          );
        }
        return 1;
      }),
    );
    deleted += results.reduce((sum, value) => sum + value, 0);
  }
  return deleted;
}
