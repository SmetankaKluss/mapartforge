import { cp, mkdir, readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { includeCloudSource } from './classic-cloud-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'public', 'classic');
const source = path.resolve(process.argv[2] || '../mapkluss-classic/dist');
if (source === destination || source.startsWith(`${destination}${path.sep}`)) throw new Error('Source must be an independent Classic build.');
const manifest = JSON.parse(await readFile(path.join(source, 'classic-manifest.json'), 'utf8'));
if (manifest.name !== 'MapKluss Classic' || manifest.license !== 'GPL-3.0-only' || manifest.source !== 'mapkluss-classic-source.zip') throw new Error('Not a complete licensed Classic build.');
await readFile(path.join(source, manifest.source));
await readFile(path.join(source, 'LICENSE.txt'));

async function inventory(directory, prefix = '') {
  const files = {};
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symlink not allowed: ${relative}`);
    if (entry.isDirectory()) Object.assign(files, await inventory(directory, relative));
    else files[relative] = createHash('sha256').update(await readFile(path.join(directory, relative))).digest('hex');
  }
  return files;
}

const files = await inventory(source);
const combinedSource = await includeCloudSource(await readFile(path.join(source, manifest.source)));
files[manifest.source] = createHash('sha256').update(combinedSource).digest('hex');
const receiptPath = path.join(destination, 'STAGED-FILES.json');
let previous = {};
try { previous = JSON.parse(await readFile(receiptPath, 'utf8')).files; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
// Only replace previously generated files after validating their paths and hashes.
for (const [relative, hash] of Object.entries(previous)) {
  const target = path.resolve(destination, relative);
  if (!target.startsWith(`${destination}${path.sep}`)) throw new Error('Unsafe staged path');
  if (createHash('sha256').update(await readFile(target)).digest('hex') !== hash) throw new Error(`Locally modified Classic file: ${relative}`);
}
await mkdir(destination, { recursive: true });
for (const relative of Object.keys(files)) {
  if (!(relative in previous)) {
    try { await readFile(path.join(destination, relative)); throw new Error(`Untracked destination file: ${relative}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
await cp(source, destination, { recursive: true });
await writeFile(path.join(destination, manifest.source), combinedSource);
for (const relative of Object.keys(previous)) if (!(relative in files)) await unlink(path.resolve(destination, relative));
await writeFile(receiptPath, JSON.stringify({ version: manifest.version, upstream: manifest.upstream, files }, null, 2));
console.log(`Staged Classic ${manifest.version}: ${Object.keys(files).length} files including GPL source.`);
