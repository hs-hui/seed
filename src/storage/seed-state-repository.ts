import path from 'node:path';
import type { SeedState } from '../domain.js';
import { now } from '../domain.js';
import { atomicWrite, backup, exists, readJson } from '../utils/fs.js';
import { migrateSeed } from './migrations.js';

const saveQueues = new Map<string, Promise<void>>();
function queueKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved;
}

/** State-file persistence, including migration, rolling backup and recovery. */
export class SeedStateRepository {
  constructor(private readonly base: string) {}

  private get file(): string { return path.join(this.base, 'seed.json'); }
  private get backupFile(): string { return path.join(this.base, '.backup', 'seed.json.bak'); }

  async exists(): Promise<boolean> {
    if (await exists(this.file)) return true;
    try { migrateSeed(await readJson<unknown>(this.backupFile)); return true; }
    catch { return false; }
  }

  async load(): Promise<SeedState> {
    try { return migrateSeed(await readJson<unknown>(this.file)); }
    catch (error) {
      // A newer schema must never be overwritten by an older rolling backup.
      if (error instanceof Error && error.message.startsWith('seed-version-')) throw error;
      const backupFile = this.backupFile;
      try {
        const recovered = migrateSeed(await readJson<unknown>(backupFile));
        await atomicWrite(this.file, `${JSON.stringify(recovered, null, 2)}\n`);
        return recovered;
      } catch { throw error; }
    }
  }

  async save(seed: SeedState): Promise<void> {
    const validated = migrateSeed(seed);
    const file = this.file;
    const backupFile = this.backupFile;
    // Backup and replacement share a queue so overlapping saves cannot
    // publish an older backup after a newer state has been written.
    const key = queueKey(file);
    const previous = saveQueues.get(key) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(async () => {
      await backup(file, backupFile);
      await atomicWrite(file, `${JSON.stringify({ ...validated, updatedAt: now() }, null, 2)}\n`);
    });
    saveQueues.set(key, operation);
    try { await operation; }
    finally { if (saveQueues.get(key) === operation) saveQueues.delete(key); }
  }
}
