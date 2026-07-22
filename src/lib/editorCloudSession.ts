const CLOUD_SOURCE_PARAMS = ['companionImport', 'artVersion', 'art'] as const;

/**
 * Keep the current in-memory Cloud identity for subsequent saves, but make the
 * browser URL a fresh-editor URL so a later reload cannot update the old art.
 */
export function detachEditorUrlFromCloudSource(href: string): string {
  const url = new URL(href);
  for (const key of CLOUD_SOURCE_PARAMS) url.searchParams.delete(key);
  return url.toString();
}
