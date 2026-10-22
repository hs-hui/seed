import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entrySource = path.join(repoRoot, 'src', 'cli', 'index.ts');

describe('CLI entry source hygiene', () => {
  it('starts with the shebang and no UTF-8 byte order mark', async () => {
    const bytes = await readFile(entrySource);
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(bytes.subarray(0, 2).toString('utf8')).toBe('#!');
  });

  it('does not render the garden picker label with mojibake in place of a dash', async () => {
    const source = await readFile(entrySource, 'utf8');
    expect(source).not.toContain('??${statusLabel');
  });
});
