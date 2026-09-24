import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prefix = 'mapkluss-cloud-bridge/';
const stamp = new Date('2026-09-25T00:00:00Z');

export async function includeCloudSource(classicArchive) {
  const zip = await JSZip.loadAsync(classicArchive);
  zip.remove(prefix);
  const put = (name, contents) => zip.file(prefix + name, contents, { date: stamp });
  async function add(relative) {
    const absolute = path.join(root, relative);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`Cloud source refuses symlink: ${relative}`);
    if (info.isDirectory()) {
      for (const entry of (await readdir(absolute)).sort()) await add(`${relative}/${entry}`);
    } else {
      if (/(^|\/)(\.env[^/]*|.*\.(pem|key|p12))$/i.test(relative)) throw new Error(`Unexpected private source file: ${relative}`);
      put(relative, await readFile(absolute));
    }
  }
  // Include the full source tree so worker URLs, assets and transitive imports
  // remain rebuildable. Never include local environment files or deployment data.
  for (const entry of ['src', 'LICENSE', 'package.json', 'package-lock.json', 'scripts/classic-cloud-source.mjs']) await add(entry);
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  for (const [location, pkg] of Object.entries(lock.packages)) {
    if (!location || pkg.dev) continue;
    for (const name of await readdir(path.join(root, location))) {
      if (!/^(license|licence|copying|notice)([.-]|$)/i.test(name)) continue;
      const file = path.join(root, location, name);
      if ((await lstat(file)).isFile()) put(`licenses/${location.replaceAll('node_modules/', '')}/${name}`, await readFile(file));
    }
  }
  put('classic-cloud.vite.config.mjs', `import { defineConfig } from 'vite';
export default defineConfig({ publicDir: false, build: { rollupOptions: {
  input: 'src/classicCloudBridge.ts', output: { entryFileNames: 'classic-cloud-api.js' }
} } });
`);
  put('README.md', `# MapKluss Classic Cloud bridge source

Copyright 2026 SmetankaKluss. Original MIT license: LICENSE.
Included with the GPL-3.0-only Classic application; MIT notices are preserved.
See ../mapkluss-classic/LICENSE for the combined application's GPL terms.

This source is packaged from the same host checkout as the browser bridge.
The complete src tree is included to preserve transitive modules and assets.
No account credentials or private server configuration are required to build.

## Rebuild

Use Node.js 22.12 or newer. From this directory run:

    npm ci
    npx vite build --config classic-cloud.vite.config.mjs

The output is dist/classic-cloud-api.js and its generated chunks. Serve those
alongside Classic at the site root. The build uses the same code but does not
share chunk boundaries with the full Studio build. Cloud operations additionally
require a configured MapKluss-compatible API and a signed-in account; building
does not provide access to the hosted service or other users' data.
`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = path.resolve(process.argv[2]);
  const contents = await includeCloudSource(await readFile(target));
  await writeFile(target, contents);
  const receiptPath = path.join(path.dirname(target), 'STAGED-FILES.json');
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  receipt.files[path.basename(target)] = createHash('sha256').update(contents).digest('hex');
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  console.log('Packaged the current Classic Cloud bridge source and dependency licenses.');
}
