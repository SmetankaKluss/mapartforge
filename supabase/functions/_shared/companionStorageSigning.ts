import {
  chunkValues,
  mapSignedPreviewUrls,
  type PreviewSigningResult,
} from './companionPreviewBatch.ts';
import { mapWithConcurrency } from './boundedConcurrency.ts';

export type StorageSigningRow = {
  key: string;
  bucket: string;
  path: string;
};

export type StorageSigningOptions = {
  bestEffort?: boolean;
  concurrency?: number;
  onBatchError?: (error: unknown) => void;
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
  const byBucket = new Map<string, StorageSigningRow[]>();
  for (const row of rows) {
    const grouped = byBucket.get(row.bucket) ?? [];
    grouped.push(row);
    byBucket.set(row.bucket, grouped);
  }

  const batches = Array.from(byBucket.entries()).flatMap(([bucket, bucketRows]) => {
    const uniquePaths = Array.from(new Set(bucketRows.map(row => row.path)));
    return chunkValues(uniquePaths, 50).map(paths => ({ bucket, bucketRows, paths }));
  });

  const signedUrls = new Map<string, string>();
  await mapWithConcurrency(batches, options.concurrency ?? 4, async ({ bucket, bucketRows, paths }) => {
    try {
      const results = await signBatch(bucket, paths, expiresIn);
      for (const [key, signedUrl] of mapSignedPreviewUrls(bucketRows, results)) {
        signedUrls.set(key, signedUrl);
      }
    } catch (error) {
      if (!options.bestEffort) throw error;
      options.onBatchError?.(error);
    }
  });
  return signedUrls;
}
