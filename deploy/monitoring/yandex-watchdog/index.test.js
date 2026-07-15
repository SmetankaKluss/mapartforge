'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { _internals } = require('./index.js');

test('accepts a recent successful workflow run', () => {
  const now = Date.parse('2026-07-15T12:00:00Z');
  assert.doesNotThrow(() => _internals.assertWorkflowHealthy([
    {
      status: 'completed',
      conclusion: 'success',
      updated_at: '2026-07-15T11:30:00Z',
    },
  ], 4, now));
});

test('rejects a newer failed workflow even when an older success exists', () => {
  const now = Date.parse('2026-07-15T12:00:00Z');
  assert.throws(() => _internals.assertWorkflowHealthy([
    {
      status: 'completed',
      conclusion: 'success',
      updated_at: '2026-07-15T11:00:00Z',
    },
    {
      status: 'completed',
      conclusion: 'failure',
      updated_at: '2026-07-15T11:30:00Z',
    },
  ], 4, now), /latest completed run is failure/);
});

test('rejects stale successful workflow runs', () => {
  const now = Date.parse('2026-07-15T12:00:00Z');
  assert.throws(() => _internals.assertWorkflowHealthy([
    {
      status: 'completed',
      conclusion: 'success',
      updated_at: '2026-07-15T06:00:00Z',
    },
  ], 4, now), /older than 4 hours/);
});

test('validates cached readyz freshness', () => {
  const now = Date.parse('2026-07-15T12:00:00Z');
  assert.doesNotThrow(() => _internals.validateReadyz({
    ok: true,
    stale: false,
    checkedAt: now - 10_000,
  }, now, 60));
  assert.throws(() => _internals.validateReadyz({
    ok: true,
    stale: false,
    checkedAt: now - 61_000,
  }, now, 60), /too old/);
});
