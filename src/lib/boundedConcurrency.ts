export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError('concurrency must be a positive integer');
  }

  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let firstError: unknown;
  let hasError = false;

  const runWorker = async () => {
    while (!hasError) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        firstError = error;
        hasError = true;
      }
    }
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  if (hasError) throw firstError;
  return results;
}
