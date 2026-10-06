import { appendFile, mkdir, open, readFile, rename, rm, stat, writeFile, copyFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export async function exists(filePath: string): Promise<boolean> {
  try { await stat(filePath); return true; } catch { return false; }
}
export async function ensureDir(dir: string): Promise<void> { await mkdir(dir, { recursive: true }); }
export async function readJson<T>(filePath: string): Promise<T> { return JSON.parse(await readFile(filePath, 'utf8')) as T; }
const writeQueues = new Map<string, Promise<void>>();
const appendQueues = new Map<string, Promise<void>>();
const mutationQueues = new Map<string, Promise<unknown>>();
const lockOwner = os.hostname() + ':' + process.pid;
function queueKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved;
}
/** Serialize read-modify-write domain mutations that share one state file. */
export async function withKeyedLock<T>(filePath: string, action: () => Promise<T>): Promise<T> {
  const key = queueKey(filePath);
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    await ensureDir(path.dirname(key));
    const lockPath = key + '.lock';
    const token = randomUUID();
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let sharingRetries = 0;
    while (!handle) {
      try {
        handle = await open(lockPath, 'wx');
        await handle.writeFile(JSON.stringify({ owner: lockOwner, token, createdAt: Date.now() }));
      } catch (error) {
        if (handle) { await handle.close(); handle = undefined; await rm(lockPath, { force: true }); }
        const code = (error as NodeJS.ErrnoException).code;
        // Windows may report a sharing violation while another process is
        // opening or deleting this file. Retry briefly, but surface persistent
        // permission errors instead of waiting forever.
        if (process.platform === 'win32' && (code === 'EPERM' || code === 'EACCES') && sharingRetries++ < 200) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          continue;
        }
        if (code !== 'EEXIST') throw error;
        sharingRetries = 0;
        try {
          const lock = JSON.parse(await readFile(lockPath, 'utf8')) as { owner?: string; createdAt?: number };
          const [host, pidText] = (lock.owner ?? '').split(':');
          const pid = Number(pidText);
          let stale = false;
          if (host === os.hostname() && Number.isInteger(pid) && pid > 0) {
            try { process.kill(pid, 0); } catch (probeError) { stale = (probeError as NodeJS.ErrnoException).code === 'ESRCH'; }
          } else stale = Date.now() - (lock.createdAt ?? 0) > 60_000;
          if (stale) await rm(lockPath, { force: true });
        } catch (readError) {
          if ((readError as NodeJS.ErrnoException).code === 'ENOENT') continue;
          try { if (Date.now() - (await stat(lockPath)).mtimeMs > 60_000) await rm(lockPath, { force: true }); }
          catch { /* another process removed it */ }
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    try { return await action(); }
    finally {
      await handle.close();
      try {
        const lock = JSON.parse(await readFile(lockPath, 'utf8')) as { token?: string };
        if (lock.token === token) await rm(lockPath, { force: true, recursive: true, maxRetries: 10, retryDelay: 25 });
      } catch { /* lock was already reclaimed */ }
    }
  });
  mutationQueues.set(key, operation);
  try { return await operation; }
  finally { if (mutationQueues.get(key) === operation) mutationQueues.delete(key); }
}
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  // Serialize replacements for the same path. On Windows, removing the old
  // file just before rename is not safe when two async callers overlap: one
  // caller can remove the target while the other is in the rename syscall.
  const key = queueKey(filePath);
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    await ensureDir(path.dirname(filePath));
    // A process-wide fixed temp name lets two overlapping writes overwrite
    // each other's staging file. Use a unique sibling so separate CLI calls
    // cannot publish partial or cross-wired state.
    const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, content, 'utf8');
      if (process.platform === 'win32') await rm(filePath, { force: true });
      await rename(tmp, filePath);
    } finally {
      await rm(tmp, { force: true });
    }
  });
  writeQueues.set(key, operation);
  try { await operation; }
  finally { if (writeQueues.get(key) === operation) writeQueues.delete(key); }
}
export async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  // Serialize appends for the same history file. Multiple commands can
  // finish a turn at once (for example a scripted batch); queueing keeps
  // records newline-delimited and preserves each event instead of relying on
  // platform-specific append ordering.
  const key = queueKey(filePath);
  const previous = appendQueues.get(key) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    await ensureDir(path.dirname(filePath));
    await appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
  });
  appendQueues.set(key, operation);
  try { await operation; }
  finally { if (appendQueues.get(key) === operation) appendQueues.delete(key); }
}
export async function backup(filePath: string, backupPath: string): Promise<void> {
  if (await exists(filePath)) { await ensureDir(path.dirname(backupPath)); await copyFile(filePath, backupPath); }
}
export async function listFiles(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return [];
  return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => path.join(dir, entry.name));
}
export async function ensureLine(filePath: string, line: string): Promise<void> {
  const key = queueKey(filePath);
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    let content = '';
    try { content = await readFile(filePath, 'utf8'); } catch { /* file will be created */ }
    if (!content.split(/\r?\n/).some((entry) => entry.trim() === line.trim())) {
      const suffix = content.length && !content.endsWith('\n') ? '\n' : '';
      await ensureDir(path.dirname(filePath));
      await writeFile(filePath, `${content}${suffix}${line}\n`, 'utf8');
    }
  });
  writeQueues.set(key, operation);
  try { await operation; }
  finally { if (writeQueues.get(key) === operation) writeQueues.delete(key); }
}
