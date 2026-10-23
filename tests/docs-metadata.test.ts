import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const readRepoFile = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('package metadata and README stay in sync', () => {
  it('declares the Node.js version the build needs and documents it in both READMEs', async () => {
    const pkg = JSON.parse(await readRepoFile('package.json')) as { engines?: { node?: string } };
    expect(pkg.engines?.node).toBe('>=20.10');
    expect(await readRepoFile('README.md')).toContain('20.10');
    expect(await readRepoFile('README.ko.md')).toContain('20.10');
  });
});
