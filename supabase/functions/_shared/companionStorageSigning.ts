import {
  chunkValues,
  mapSignedPreviewUrls,
  type PreviewSigningResult,
} from './companionPreviewBatch.ts';
import { mapWithConcurrency } from './boundedConcurrency.ts';
import {
  readYandexStorageConfig,
  signAvailableYandexObjects,
} from './yandexStorageSigning.ts';
import {
  readCompanionArtifactYandexConfig,
  signCompanionArtifactYandexDownload,
} from './companionArtifactYandexStorage.ts';

let yandexCircuitOpenUntil = 0;

function isYandexInfrastructureError(error: unknown): boolean {
  const value = String(error ?? '');
  if (value === 'target_unavailable') return true;
  const status = Number(value.replace(/^target_/, ''));
  return status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
}

export type StorageSigningRow = {
  key: string;
  bucket: string;
  path: string;
  storageProvider?: 'supabase' | 'yandex';
};

export type StorageSigningOptions = {
  bestEffort?: boolean;
  concurrency?: number;
  onBatchError?: (error: unknown) => void;
  primarySignBatch?: (
    bucket: string,
    paths: string[],
    expiresIn: number,
  ) => Promise<readonly PreviewSigningResult[]>;
  artifactSign?: (
    bucket: string,
    path: string,
    expiresIn: number,
  ) => Promise<string>;
};

export async function signStorageRows(
  rows: readonly StorageSigningRow[],
  expiresIn: number,
  signBatch: (
    bucket: string,
    paths: string[],
    expiresIn: number,
  ) => Promise<readonly PreviewSigningResult[]>,
  options: StorageSigningOptions = {},
): Promise<Map<string, string>> {
  const yandexRows = rows.filter(row => row.storageProvider === 'yandex');
  const legacyRows = rows.filter(row => row.storageProvider !== 'yandex');
  const signedUrls = new Map<string, string>();

  if (yandexRows.length > 0) {
    try {
      await mapWithConcurrency(yandexRows, options.concurrency ?? 4, async row => {
        const signedUrl = options.artifactSign
          ? await options.artifactSign(row.bucket, row.path, expiresIn)
          : await (async () => {
            const artifactConfig = readCompanionArtifactYandexConfig();
            if (!artifactConfig) throw new Error('artifact_yandex_storage_unavailable');
            return signCompanionArtifactYandexDownload(
              artifactConfig,
              row.bucket,
              row.path,
              expiresIn,
            );
          })();
        signedUrls.set(row.key, signedUrl);
      });
    } catch (error) {
      if (!options.bestEffort) throw error;
      options.onBatchError?.(error);
    }
  }

  const byBucket = new Map<string, StorageSigningRow[]>();
  for (const row of legacyRows) {
    const grouped = byBucket.get(row.bucket) ?? [];
    grouped.push(row);
    byBucket.set(row.bucket, grouped);
  }

  const batches = Array.from(byBucket.entries()).flatMap(([bucket, bucketRows]) => {
    const uniquePaths = Array.from(new Set(bucketRows.map(row => row.path)));
    return chunkValues(uniquePaths, 50).map(paths => ({ bucket, bucketRows, paths }));
  });

  await mapWithConcurrency(batches, options.concurrency ?? 4, async ({ bucket, bucketRows, paths }) => {
    try {
      const yandexConfig = options.primarySignBatch || Date.now() < yandexCircuitOpenUntil
        ? null
        : readYandexStorageConfig();
      const primarySignBatch = options.primarySignBatch ?? (yandexConfig
        ? (sourceBucket: string, sourcePaths: string[], lifetime: number) => (
          signAvailableYandexObjects(yandexConfig, sourceBucket, sourcePaths, lifetime)
        )
        : null);
      const primaryResults = primarySignBatch
        ? await primarySignBatch(bucket, paths, expiresIn)
        : [];
      if (yandexConfig && primaryResults.length > 0
        && !primaryResults.some(result => Boolean(result.signedUrl) && !result.error)
        && primaryResults.some(result => isYandexInfrastructureError(result.error))) {
        yandexCircuitOpenUntil = Date.now() + 30_000;
      }
      const primaryUrls = mapSignedPreviewUrls(bucketRows, primaryResults);
      for (const [key, signedUrl] of primaryUrls) {
        signedUrls.set(key, signedUrl);
      }
      const unresolvedPaths = paths.filter(path => !primaryResults.some(result => (
        result.path === path && Boolean(result.signedUrl) && !result.error
      )));
      if (unresolvedPaths.length > 0) {
        const fallbackResults = await signBatch(bucket, unresolvedPaths, expiresIn);
        for (const [key, signedUrl] of mapSignedPreviewUrls(bucketRows, fallbackResults)) {
          signedUrls.set(key, signedUrl);
        }
      }
    } catch (error) {
      if (!options.bestEffort) throw error;
      options.onBatchError?.(error);
    }
  });
  return signedUrls;
}
