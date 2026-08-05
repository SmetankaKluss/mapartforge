import { deriveCloudArtSnapshot } from './companionCloudSnapshot.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('cloud snapshot deduplicates recent arts while preserving owned and favorite lists', () => {
  const owned = [
    { artId: 'owned-new', isFavorite: false, updatedAt: '2026-08-02T11:00:00Z' },
    { artId: 'shared', isFavorite: false, updatedAt: '2026-08-02T10:00:00Z' },
  ];
  const favorites = [
    { artId: 'shared', isFavorite: true, updatedAt: '2026-08-02T10:00:00Z' },
    { artId: 'favorite-old', isFavorite: true, updatedAt: '2026-08-01T10:00:00Z' },
  ];

  const snapshot = deriveCloudArtSnapshot(owned, favorites);
  assert(snapshot.arts.length === 2);
  assert(snapshot.favorites.length === 2);
  assert(snapshot.recent.length === 3);
  assert(snapshot.recent.map(item => item.artId).join(',') === 'owned-new,shared,favorite-old');
  assert(snapshot.recent[1].isFavorite === true);
  assert(snapshot.arts[1].isFavorite === false);
});

Deno.test('cloud snapshot clamps its recent result', () => {
  const items = Array.from({ length: 35 }, (_, index) => ({
    artId: String(index),
    isFavorite: false,
    updatedAt: new Date(Date.UTC(2026, 7, 2, 0, index)).toISOString(),
  }));
  const snapshot = deriveCloudArtSnapshot(items, [], 12);
  assert(snapshot.recent.length === 12);
  assert(snapshot.recent[0].artId === '34');
  assert(snapshot.recent[11].artId === '23');
});
