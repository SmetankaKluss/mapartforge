import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VERSION } from '../../version';

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as Record<string, unknown>;
}

describe('site version metadata', () => {
  it('keeps runtime, package, and lockfile versions synchronized', () => {
    const packageJson = readJson('../../../package.json');
    const packageLock = readJson('../../../package-lock.json');
    const packageVersion = packageJson.version;
    const lockPackages = packageLock.packages as Record<string, { version?: string }>;

    expect(VERSION).toBe(`v${packageVersion}`);
    expect(packageLock.version).toBe(packageVersion);
    expect(lockPackages['']?.version).toBe(packageVersion);
  });
});
