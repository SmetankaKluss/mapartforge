type Entry = { row: { id: string; current_version_id: string | null } };
type Version = { id: string; art_id: string; settings: unknown };

/** Only classify the exact current version of already-authorized library rows. */
export async function libraryBuildTechniques(
  entries: Entry[],
  fetchVersions: (ids: string[]) => Promise<Version[]>,
): Promise<Map<string, string>> {
  const ids = [...new Set(entries.flatMap(({ row }) => row.current_version_id ? [row.current_version_id] : []))];
  const expected = new Map(entries.map(({ row }) => [row.id, row.current_version_id]));
  const result = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 40) {
    for (const version of await fetchVersions(ids.slice(offset, offset + 40))) {
      if (expected.get(version.art_id) !== version.id) continue;
      const settings = version.settings;
      const technique = settings && typeof settings === 'object' && !Array.isArray(settings)
        ? (settings as Record<string, unknown>).buildTechnique : null;
      result.set(version.art_id, technique === 'suppression_two_layer' ? 'suppression_two_layer' : 'standard');
    }
  }
  return result;
}
