export type PreviewSigningRow = { key: string; path: string };
export type PreviewSigningResult = {
  path?: string | null;
  signedUrl?: string | null;
  error?: unknown;
};

export function libraryPreviewKey(artId: string, versionId: string, previewPath: string): string {
  return `${artId}\u0000${versionId}\u0000${previewPath}`;
}

export function chunkValues<T>(values: readonly T[], size: number): T[][] {
  if (!Number.isSafeInteger(size) || size < 1) throw new RangeError('chunk size must be a positive integer');
  return Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, index * size + size),
  );
}

export function mapSignedPreviewUrls(
  rows: readonly PreviewSigningRow[],
  results: readonly PreviewSigningResult[],
): Map<string, string> {
  const rowsByPath = new Map<string, PreviewSigningRow[]>();
  for (const row of rows) {
    const grouped = rowsByPath.get(row.path) ?? [];
    grouped.push(row);
    rowsByPath.set(row.path, grouped);
  }
  const mapped = new Map<string, string>();
  for (const result of results) {
    const matchingRows = rowsByPath.get(String(result.path ?? '')) ?? [];
    if (result.signedUrl && !result.error) {
      for (const row of matchingRows) mapped.set(row.key, result.signedUrl);
    }
  }
  return mapped;
}
