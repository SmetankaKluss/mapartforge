import { signStorageRows } from './companionStorageSigning.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('storage signing batches each bucket and preserves partial results by path', async () => {
  const calls: string[] = [];
  const result = await signStorageRows([
    { key: 'a', bucket: 'one', path: 'a.png' },
    { key: 'b', bucket: 'two', path: 'b.png' },
    { key: 'missing', bucket: 'one', path: 'missing.png' },
  ], 600, async (bucket, paths, expiresIn) => {
    calls.push(`${bucket}:${expiresIn}:${paths.join(',')}`);
    return paths
      .filter(path => path !== 'missing.png')
      .reverse()
      .map(path => ({ path, signedUrl: `https://signed/${bucket}/${path}` }));
  });

  assert(calls.length === 2);
  assert(result.get('a') === 'https://signed/one/a.png');
  assert(result.get('b') === 'https://signed/two/b.png');
  assert(!result.has('missing'));
});

Deno.test('storage signing chunks more than fifty paths', async () => {
  let calls = 0;
  const rows = Array.from({ length: 100 }, (_, index) => ({
    key: String(index),
    bucket: 'one',
    path: `${index}.png`,
  }));
  const result = await signStorageRows(rows, 600, async (_bucket, paths) => {
    calls += 1;
    return paths.map(path => ({ path, signedUrl: `https://signed/${path}` }));
  });
  assert(calls === 2, `expected 2 calls, got ${calls}`);
  assert(result.size === 100);
});

Deno.test('best-effort storage signing keeps successful batches when one fails', async () => {
  let errors = 0;
  const result = await signStorageRows([
    { key: 'ok', bucket: 'one', path: 'ok.png' },
    { key: 'failed', bucket: 'two', path: 'failed.png' },
  ], 600, async (bucket, paths) => {
    if (bucket === 'two') throw new Error('signing failed');
    return paths.map(path => ({ path, signedUrl: `https://signed/${path}` }));
  }, {
    bestEffort: true,
    onBatchError: () => errors++,
  });

  assert(result.get('ok') === 'https://signed/ok.png');
  assert(!result.has('failed'));
  assert(errors === 1);
});

Deno.test('strict storage signing still rejects a failed batch', async () => {
  let rejected = false;
  try {
    await signStorageRows([
      { key: 'failed', bucket: 'one', path: 'failed.png' },
    ], 600, async () => {
      throw new Error('signing failed');
    });
  } catch {
    rejected = true;
  }
  assert(rejected);
});
