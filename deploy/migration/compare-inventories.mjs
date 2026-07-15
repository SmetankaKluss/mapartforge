import fs from 'node:fs';
import process from 'node:process';

const [sourcePath, targetPath] = process.argv.slice(2);
if (!sourcePath || !targetPath) {
  throw new Error('Usage: compare-inventories.mjs source.json target.json');
}

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const target = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
const ignored = new Set(['database_bytes', 'postgres_version_num']);
const failures = [];

for (const [key, sourceValue] of Object.entries(source)) {
  if (ignored.has(key)) continue;
  if (target[key] !== sourceValue) {
    failures.push(`${key}: source=${sourceValue} target=${target[key]}`);
  }
}

for (const key of Object.keys(source).filter((name) => name.endsWith('_orphans'))) {
  if (source[key] !== 0 || target[key] !== 0) {
    failures.push(`${key}: integrity violation source=${source[key]} target=${target[key]}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Migration inventory mismatch:\n${failures.join('\n')}`);
}

console.log('Migration inventories match');
