import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { SeedState, seedSchema } from '../domain.js';
import { exists, readJson } from '../utils/fs.js';

export type GardenEntry = { path: string; seed: SeedState };

/** List nearby Seed projects without descending into dependency or VCS trees. */
export async function gardenEntries(start = process.cwd()): Promise<GardenEntry[]> {
  const roots: string[] = [];
  // A command can be launched from `packages/app` inside a Seed project.
  // Start the garden walk at the nearest ancestor containing `.seed/` so the
  // current project and its sibling Seed projects remain discoverable.
  let rootStart = path.resolve(start);
  let cursor = rootStart;
  while (true) {
    if (await seedMarkerExists(cursor)) { rootStart = cursor; break; }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const queue: Array<{ root: string; depth: number }> = [{ root: rootStart, depth: 0 }];
  const seen = new Set<string>();
  const ignored = new Set(['.git', '.seed', 'node_modules', 'dist', 'build', 'coverage']);
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current.root)) continue;
    seen.add(current.root); roots.push(current.root);
    if (current.depth >= 3) continue;
    try {
      const children = await readdir(current.root, { withFileTypes: true });
      for (const child of children) {
        if (child.isDirectory() && !child.name.startsWith('.') && !ignored.has(child.name)) {
          queue.push({ root: path.join(current.root, child.name), depth: current.depth + 1 });
        }
      }
    } catch { /* an unreadable directory simply has no entries */ }
  }
  const entries: GardenEntry[] = [];
  for (const root of roots) {
    const currentFile = path.join(root, '.seed', 'seed.json');
    const backupFile = path.join(root, '.seed', '.backup', 'seed.json.bak');
    const file = await exists(currentFile) ? currentFile : backupFile;
    if (!(await exists(file))) continue;
    try { entries.push({ path: root, seed: seedSchema.parse(await readJson<unknown>(file)) }); } catch { /* ignore invalid unrelated projects */ }
  }
  return entries.sort((a, b) => a.seed.updatedAt.localeCompare(b.seed.updatedAt));
}

async function seedMarkerExists(root: string): Promise<boolean> {
  return exists(path.join(root, '.seed', 'seed.json')) || exists(path.join(root, '.seed', '.backup', 'seed.json.bak'));
}
