import os from 'node:os';
import path from 'node:path';
import { appendJsonLine, atomicWrite, backup, ensureDir, exists, listFiles, readJson } from '../utils/fs.js';
import { ensureSeedRoot } from '../utils/path.js';
import { Branch, ConversationEntry, GrowthEvent, SeedState, seedSchema, now } from '../domain.js';

export class SeedStore {
  constructor(public readonly root: string) {}
  get base(): string { return path.join(this.root, '.seed'); }
  async hasSeed(): Promise<boolean> { return exists(path.join(this.base, 'seed.json')); }
  async load(): Promise<SeedState> {
    const value = seedSchema.parse(await readJson<unknown>(path.join(this.base, 'seed.json')));
    return value;
  }
  async save(seed: SeedState): Promise<void> {
    await backup(path.join(this.base, 'seed.json'), path.join(this.base, '.backup', 'seed.json.bak'));
    await atomicWrite(path.join(this.base, 'seed.json'), `${JSON.stringify({ ...seed, updatedAt: now() }, null, 2)}\n`);
  }
  async create(seed: SeedState): Promise<void> {
    await Promise.all(['conversations', 'branches', 'decisions', 'research', 'harvest', 'history', '.backup'].map((directory) => ensureDir(path.join(this.base, directory))));
    await this.save(seed);
  }
  async appendConversation(entry: ConversationEntry): Promise<void> {
    await atomicWrite(path.join(this.base, 'conversations', `${entry.id}.json`), `${JSON.stringify(entry, null, 2)}\n`);
  }
  async conversations(seedId: string): Promise<ConversationEntry[]> {
    const files = await listFiles(path.join(this.base, 'conversations'));
    const values: ConversationEntry[] = [];
    for (const file of files) { try { const v = await readJson<ConversationEntry>(file); if (v.seedId === seedId) values.push(v); } catch { /* ignore corrupt unrelated files */ } }
    return values.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async saveBranch(branch: Branch): Promise<void> {
    await atomicWrite(path.join(this.base, 'branches', `${branch.id}.json`), `${JSON.stringify(branch, null, 2)}\n`);
  }
  async branches(seedId: string): Promise<Branch[]> {
    const files = await listFiles(path.join(this.base, 'branches')); const values: Branch[] = [];
    for (const file of files) { try { const v = await readJson<Branch>(file); if (v.seedId === seedId) values.push(v); } catch { /* ignore */ } }
    return values.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async appendEvent(event: GrowthEvent): Promise<void> { await appendJsonLine(path.join(this.base, 'history', 'events.jsonl'), event); }
  async events(seedId: string): Promise<GrowthEvent[]> {
    const file = path.join(this.base, 'history', 'events.jsonl'); if (!(await exists(file))) return [];
    const text = await (await import('node:fs/promises')).readFile(file, 'utf8'); const events: GrowthEvent[] = [];
    for (const line of text.split(/\r?\n/).filter(Boolean)) { try { const v = JSON.parse(line) as GrowthEvent; if (v.seedId === seedId) events.push(v); } catch { /* ignore malformed event */ } }
    return events;
  }
}

export async function openStore(): Promise<SeedStore> { return new SeedStore(await ensureSeedRoot()); }

export type GlobalConfig = {
  version: number; lang?: 'en' | 'ko'; activeProvider: string; providers: ProviderConfig[];
};
export type ProviderConfig = {
  id: string; name: string; type: 'openai' | 'gemini' | 'anthropic' | 'custom';
  defaultModel: string; baseUrl?: string; enabled: boolean; connectionMode?: 'api-key' | 'oauth';
};
const defaultConfig: GlobalConfig = { version: 1, activeProvider: 'local', providers: [
  { id: 'local', name: 'Local fallback', type: 'custom', defaultModel: 'rule-based', enabled: true },
] };
export async function configPath(): Promise<string> {
  const home = process.env.SEED_HOME ?? path.join(os.homedir(), '.seed'); await ensureDir(home); return path.join(home, 'config.json');
}
export async function loadConfig(): Promise<GlobalConfig> {
  const file = await configPath();
  let global: GlobalConfig = { ...defaultConfig, providers: [...defaultConfig.providers] };
  if (await exists(file)) {
    try { const parsed = await readJson<Partial<GlobalConfig>>(file); global = { ...global, ...parsed, providers: parsed.providers ?? global.providers }; } catch { /* fall back to defaults */ }
  }
  const projectFile = path.join(process.cwd(), '.seed', 'config.json');
  if (await exists(projectFile)) {
    try { const project = await readJson<Partial<GlobalConfig>>(projectFile); return { ...global, ...project, providers: project.providers ?? global.providers }; } catch { /* ignore invalid project override */ }
  }
  return global;
}
export async function saveConfig(config: GlobalConfig): Promise<void> { await atomicWrite(await configPath(), `${JSON.stringify(config, null, 2)}\n`); }
