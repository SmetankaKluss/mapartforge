import {
  chunkValues,
  libraryPreviewKey,
  mapSignedPreviewUrls,
} from './companionPreviewBatch.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('preview signing maps by returned path instead of response order', () => {
  const rows = [
    { key: libraryPreviewKey('art-a', 'version-a', 'a.png'), path: 'a.png' },
    { key: libraryPreviewKey('art-b', 'version-b', 'b.png'), path: 'b.png' },
  ];
  const mapped = mapSignedPreviewUrls(rows, [
    { path: 'b.png', signedUrl: 'https://signed/b' },
    { path: 'a.png', signedUrl: 'https://signed/a' },
  ]);

  assert(mapped.get(rows[0].key) === 'https://signed/a');
  assert(mapped.get(rows[1].key) === 'https://signed/b');
});

Deno.test('preview signing ignores missing and per-path error results', () => {
  const rows = [
    { key: 'one', path: 'one.png' },
    { key: 'two', path: 'two.png' },
    { key: 'three', path: 'three.png' },
  ];
  const mapped = mapSignedPreviewUrls(rows, [
    { path: 'one.png', signedUrl: 'https://signed/one' },
    { path: 'two.png', signedUrl: 'https://signed/two', error: 'not found' },
  ]);

  assert(mapped.size === 1);
  assert(mapped.get('one') === 'https://signed/one');
});

Deno.test('preview signing reuses one signed path for duplicate library entries', () => {
  const mapped = mapSignedPreviewUrls([
    { key: 'owned', path: 'shared.png' },
    { key: 'favorite', path: 'shared.png' },
  ], [{ path: 'shared.png', signedUrl: 'https://signed/shared' }]);

  assert(mapped.get('owned') === 'https://signed/shared');
  assert(mapped.get('favorite') === 'https://signed/shared');
});

Deno.test('preview batches stay bounded for empty, single and one hundred rows', () => {
  assert(chunkValues([], 40).length === 0);
  assert(chunkValues([1], 40).length === 1);
  const chunks = chunkValues(Array.from({ length: 100 }, (_, index) => index), 40);
  assert(chunks.length === 3);
  assert(chunks[0].length === 40 && chunks[1].length === 40 && chunks[2].length === 20);
});
