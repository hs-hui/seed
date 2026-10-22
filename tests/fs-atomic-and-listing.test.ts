import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { atomicWrite, listFiles } from '../src/utils/fs.js';
import { SeedStore } from '../src/storage/store.js';
import { plant } from '../src/core/seed-manager.js';

// Intercepts rename so a test can observe the target file at the moment of the
// swap and inject Windows-style sharing errors.
const renameControl = vi.hoisted(() => ({ beforeRename: undefined as undefined | ((from: string, to: string) => Promise<void> | void) }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      await renameControl.beforeRename?.(from, to);
      return actual.rename(from, to);
    },
  };
});

async function onPlatform<T>(platform: NodeJS.Platform, action: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: platform });
  try { return await action(); }
  finally { Object.defineProperty(process, 'platform', descriptor); renameControl.beforeRename = undefined; }
}

describe('Windows atomic replacement', () => {
  it('never removes the target before renaming the staged file over it', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-atomic-target-'));
    try {
      const file = path.join(root, 'seed.json');
      await writeFile(file, 'old', 'utf8');
      const targetPresentAtRename: boolean[] = [];
      renameControl.beforeRename = (_from, to) => { targetPresentAtRename.push(existsSync(to)); };
      await onPlatform('win32', () => atomicWrite(file, 'new'));
      expect(targetPresentAtRename).toEqual([true]);
      expect(await readFile(file, 'utf8')).toBe('new');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('retries a transient Windows rename lock before succeeding', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-atomic-retry-'));
    try {
      const file = path.join(root, 'seed.json');
      let attempts = 0;
      renameControl.beforeRename = () => {
        if (attempts++ < 3) throw Object.assign(new Error('sharing violation'), { code: 'EPERM' });
      };
      await onPlatform('win32', () => atomicWrite(file, 'new'));
      expect(attempts).toBe(4);
      expect(await readFile(file, 'utf8')).toBe('new');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rethrows a persistent Windows rename lock after bounded retries and cleans staging', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-atomic-giveup-'));
    try {
      const file = path.join(root, 'seed.json');
      await writeFile(file, 'old', 'utf8');
      let attempts = 0;
      renameControl.beforeRename = () => { attempts++; throw Object.assign(new Error('locked'), { code: 'EACCES' }); };
      await expect(onPlatform('win32', () => atomicWrite(file, 'new'))).rejects.toThrow('locked');
      expect(attempts).toBe(21);
      expect(await readFile(file, 'utf8')).toBe('old');
      expect(await readdir(root)).toEqual(['seed.json']);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('record listing', () => {
  it('returns only files with the requested extension and never staging files', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'seed-list-'));
    try {
      await writeFile(path.join(dir, 'a.json'), '{}', 'utf8');
      await writeFile(path.join(dir, 'b.md'), '', 'utf8');
      await writeFile(path.join(dir, 'a.json.1.7d1f.tmp'), '{}', 'utf8');
      await writeFile(path.join(dir, 'c.tmp'), '', 'utf8');
      expect(await listFiles(dir)).toEqual([path.join(dir, 'a.json')]);
      expect(await listFiles(dir, '.md')).toEqual([path.join(dir, 'b.md')]);
      expect((await listFiles(dir, '')).sort()).toEqual([path.join(dir, 'a.json'), path.join(dir, 'b.md')]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('does not return a leftover staging file as a second conversation record', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-conversation-tmp-'));
    try {
      const store = new SeedStore(root);
      const entry = { id: 'c1', seedId: 's1', role: 'user' as const, type: 'question' as const, content: 'hi', createdAt: '2026-01-01T00:00:00.000Z' };
      await store.appendConversation(entry);
      await writeFile(path.join(store.base, 'conversations', 'c1.json.1.7d1f.tmp'), `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
      expect(await store.conversations('s1')).toEqual([entry]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('seed state recovery', () => {
  it('returns the rolling backup on load without rewriting the damaged seed file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-recover-norewrite-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A recoverable idea');
      await store.save({ ...seed, coreIdea: 'A newer idea' });
      await writeFile(path.join(store.base, 'seed.json'), '{broken', 'utf8');
      const recovered = await store.load();
      expect(recovered.coreIdea).toBe(seed.coreIdea);
      expect(await readFile(path.join(store.base, 'seed.json'), 'utf8')).toBe('{broken');
      await store.save(recovered);
      expect(JSON.parse(await readFile(path.join(store.base, 'seed.json'), 'utf8')).coreIdea).toBe(seed.coreIdea);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
