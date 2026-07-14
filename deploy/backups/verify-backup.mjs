import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [archivePath, extractedDirectory] = process.argv.slice(2);
if (!archivePath) {
  throw new Error('Usage: verify-backup.mjs /path/to/mapkluss-postgres.tar.gz [extracted-directory]');
}

const manifestPath = `${archivePath}.json`;
const inventoryPath = `${archivePath}.inventory.json`;
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert(manifest.format === 'supabase-cli-sql-tar-gzip', `Unexpected backup format: ${manifest.format}`);
verifyFile(archivePath, manifest.archive, 'archive');
verifyFile(inventoryPath, manifest.inventory, 'inventory');

if (extractedDirectory) {
  const expectedNames = ['roles.sql', 'schema.sql', 'data.sql', 'managed-metadata.json', 'migrations.tar.gz'];
  assert(Object.keys(manifest.files).sort().join(',') === expectedNames.sort().join(','), 'Unexpected SQL file manifest');
  for (const name of expectedNames) {
    verifyFile(path.join(extractedDirectory, name), { file: name, ...manifest.files[name] }, name);
  }
}

console.log('Backup manifest and checksums passed');

function verifyFile(filePath, expected, label) {
  assert(expected?.file === path.basename(filePath), `${label} filename mismatch`);
  const value = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(value).digest('hex');
  assert(value.length === expected.bytes, `${label} size mismatch`);
  assert(sha256 === expected.sha256, `${label} checksum mismatch`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
