import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchSpaResponse } from './spa-response.mjs';

test('returns a direct SPA response without redirects', async () => {
  const calls = [];
  const result = await fetchSpaResponse('https://stage.example.test/', {
    fetchImpl: async (url, options) => {
      calls.push({ url: url.toString(), options });
      return new Response('<div id="root"></div>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    },
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.finalUrl.toString(), 'https://stage.example.test/');
  assert.equal(result.redirectCount, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, 'manual');
});

test('follows a bounded same-origin canonical redirect', async () => {
  const calls = [];
  const result = await fetchSpaResponse('https://stage.example.test/cloud', {
    fetchImpl: async (url) => {
      calls.push(url.toString());
      if (calls.length === 1) {
        return new Response(null, { status: 302, headers: { location: '/cloud/' } });
      }
      return new Response('<div id="root"></div>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    },
  });

  assert.deepEqual(calls, [
    'https://stage.example.test/cloud',
    'https://stage.example.test/cloud/',
  ]);
  assert.equal(result.finalUrl.toString(), 'https://stage.example.test/cloud/');
  assert.equal(result.redirectCount, 1);
});

test('rejects a redirect to another origin', async () => {
  await assert.rejects(
    fetchSpaResponse('https://stage.example.test/cloud', {
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { location: 'https://unexpected.example/cloud/' },
      }),
    }),
    /redirected outside/,
  );
});

test('rejects a redirect without a Location header', async () => {
  await assert.rejects(
    fetchSpaResponse('https://stage.example.test/cloud', {
      fetchImpl: async () => new Response(null, { status: 302 }),
    }),
    /without Location/,
  );
});

test('rejects redirect chains above the configured limit', async () => {
  await assert.rejects(
    fetchSpaResponse('https://stage.example.test/start', {
      maxRedirects: 1,
      fetchImpl: async (url) => new Response(null, {
        status: 302,
        headers: { location: `${url.pathname}/next` },
      }),
    }),
    /exceeded 1 redirects/,
  );
});
