const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function fetchSpaResponse(url, {
  fetchImpl = fetch,
  timeoutMs = 15_000,
  maxRedirects = 3,
} = {}) {
  const initial = new URL(url);
  let current = initial;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetchImpl(current, {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: current, redirectCount };
    }

    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) {
      throw new Error(`${current} returned ${response.status} without Location`);
    }
    if (redirectCount === maxRedirects) {
      throw new Error(`${initial} exceeded ${maxRedirects} redirects`);
    }

    const next = new URL(location, current);
    if (next.origin !== initial.origin) {
      throw new Error(`${current} redirected outside ${initial.origin}`);
    }
    current = next;
  }

  throw new Error(`${initial} redirect resolution failed`);
}
