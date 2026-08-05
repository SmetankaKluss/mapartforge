import { mapWithConcurrency } from './boundedConcurrency.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('bounded concurrency preserves order and limits active tasks', async () => {
  let active = 0;
  let maxActive = 0;
  const result = await mapWithConcurrency([1, 2, 3, 4], 2, async value => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    active -= 1;
    return value * 2;
  });

  assert(maxActive === 2, `expected two active tasks, got ${maxActive}`);
  assert(JSON.stringify(result) === JSON.stringify([2, 4, 6, 8]), 'result order changed');
});

Deno.test('bounded concurrency rejects invalid limits', async () => {
  try {
    await mapWithConcurrency([1], 0, async value => value);
    throw new Error('expected invalid concurrency to fail');
  } catch (error) {
    assert(error instanceof RangeError, `unexpected error: ${String(error)}`);
  }
});

Deno.test('bounded concurrency propagates an undefined rejection reason', async () => {
  let rejected = false;
  try {
    await mapWithConcurrency([1], 1, async () => {
      throw undefined;
    });
  } catch (error) {
    rejected = true;
    assert(error === undefined, `unexpected error: ${String(error)}`);
  }
  assert(rejected, 'undefined rejection was swallowed');
});
