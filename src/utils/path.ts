import path from 'node:path';
import { exists, ensureDir } from './fs.js';

export async function findSeedRoot(start = process.cwd()): Promise<string | null> {
  let current = path.resolve(start);
  while (true) {
    if (await exists(path.join(current, '.seed', 'seed.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
export async function ensureSeedRoot(start = process.cwd()): Promise<string> {
  const found = await findSeedRoot(start);
  const root = found ?? path.resolve(start);
  await ensureDir(path.join(root, '.seed'));
  return root;
}
