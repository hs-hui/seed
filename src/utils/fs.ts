import { appendFile, mkdir, readFile, rename, rm, stat, writeFile, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export async function exists(filePath: string): Promise<boolean> {
  try { await stat(filePath); return true; } catch { return false; }
}
export async function ensureDir(dir: string): Promise<void> { await mkdir(dir, { recursive: true }); }
export async function readJson<T>(filePath: string): Promise<T> { return JSON.parse(await readFile(filePath, 'utf8')) as T; }
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, content, 'utf8');
  if (process.platform === 'win32') await rm(filePath, { force: true });
  await rename(tmp, filePath);
}
export async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}
export async function backup(filePath: string, backupPath: string): Promise<void> {
  if (await exists(filePath)) { await ensureDir(path.dirname(backupPath)); await copyFile(filePath, backupPath); }
}
export async function listFiles(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return [];
  return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => path.join(dir, entry.name));
}
