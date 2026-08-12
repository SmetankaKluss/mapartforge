import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('dry-run counts only confirmed manifest rows without printing paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mapkluss-storage-test-'));
  const manifest = join(directory, 'manifest.ndjson');
  try {
    await writeFile(manifest, [
      { capture_generation: 'capture-1', classification: 'confirmed_artifact', target_key: 'target/a' },
      { capture_generation: 'capture-1', classification: 'missing_source' },
      { capture_generation: 'capture-1', classification: 'orphan_unreferenced' },
    ].map(row => JSON.stringify(row)).join('\n'));
    const result = spawnSync(process.execPath, [
      'deploy/migration/copy-storage-manifest.mjs', manifest, '--dry-run',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.rows, 3);
    assert.equal(summary.confirmed, 1);
    assert.equal(summary.blockers, 0);
    assert.equal(result.stdout.includes('target/a'), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('copy mode refuses manifests with blockers before reading credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mapkluss-storage-test-'));
  const manifest = join(directory, 'manifest.ndjson');
  try {
    await writeFile(manifest, JSON.stringify({
      capture_generation: 'capture-1',
      classification: 'pending_reservation',
    }));
    const result = spawnSync(process.execPath, [
      'deploy/migration/copy-storage-manifest.mjs', manifest,
    ], { cwd: process.cwd(), encoding: 'utf8', env: {} });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /active reservations, conflicting references, or missing required objects/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('copy mode blocks a missing required artifact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mapkluss-storage-test-'));
  const manifest = join(directory, 'manifest.ndjson');
  try {
    await writeFile(manifest, JSON.stringify({
      capture_generation: 'capture-1',
      classification: 'missing_required_source',
    }));
    const result = spawnSync(process.execPath, [
      'deploy/migration/copy-storage-manifest.mjs', manifest,
    ], { cwd: process.cwd(), encoding: 'utf8', env: {} });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing required objects/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('manifest must come from one stable database capture', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mapkluss-storage-test-'));
  const manifest = join(directory, 'manifest.ndjson');
  try {
    await writeFile(manifest, [
      { capture_generation: 'capture-1', classification: 'missing_source' },
      { capture_generation: 'capture-2', classification: 'orphan_unreferenced' },
    ].map(row => JSON.stringify(row)).join('\n'));
    const result = spawnSync(process.execPath, [
      'deploy/migration/copy-storage-manifest.mjs', manifest, '--dry-run',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /one stable capture generation/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
