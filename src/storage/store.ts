import os from 'node:os';
import path from 'node:path';
import { appendJsonLine, atomicWrite, backup, ensureDir, exists, listFiles, readJson } from '../utils/fs.js';
import { ensureSeedRoot, findSeedRoot } from '../utils/path.js';
import { Branch, ConversationEntry, Decision, GrowthEvent, HarvestResult, ResearchEntry, SeedState, branchSchema, conversationSchema, decisionSchema, growthEventSchema, harvestResultSchema, researchSchema, seedSchema, now } from '../domain.js';

const seedSaveQueues = new Map<string, Promise<void>>();
function seedSaveKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved;
}

export class SeedStore {
  constructor(public readonly root: string) {}
  get base(): string { return path.join(this.root, '.seed'); }
  async hasSeed(): Promise<boolean> {
    if (await exists(path.join(this.base, 'seed.json'))) return true;
    // Treat a valid rolling backup as an existing Seed too. This prevents a
    // missing current file from allowing `seed "new idea"` to overwrite a
    // recoverable project.
    try { seedSchema.parse(await readJson<unknown>(path.join(this.base, '.backup', 'seed.json.bak'))); return true; }
    catch { return false; }
  }
  async load(): Promise<SeedState> {
    const file = path.join(this.base, 'seed.json');
    try { return seedSchema.parse(await readJson<unknown>(file)); }
    catch (error) {
      // A half-written or manually edited state file should not make an idea
      // disappear when the rolling backup is still valid. Restore only after
      // the backup passes the same schema check; otherwise preserve the
      // original parse error for the caller to report.
      const backupFile = path.join(this.base, '.backup', 'seed.json.bak');
      try {
        const recovered = seedSchema.parse(await readJson<unknown>(backupFile));
        await atomicWrite(file, `${JSON.stringify(recovered, null, 2)}\n`);
        return recovered;
      } catch { throw error; }
    }
  }
  async save(seed: SeedState): Promise<void> {
    const validated = seedSchema.parse(seed);
    const file = path.join(this.base, 'seed.json');
    const backupFile = path.join(this.base, '.backup', 'seed.json.bak');
    // Keep the rolling backup and its corresponding replacement in the same
    // queue. Otherwise overlapping saves can copy an older version after a
    // newer write has already started, weakening recovery guarantees.
    const key = seedSaveKey(file);
    const previous = seedSaveQueues.get(key) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(async () => {
      await backup(file, backupFile);
      await atomicWrite(file, `${JSON.stringify({ ...validated, updatedAt: now() }, null, 2)}\n`);
    });
    seedSaveQueues.set(key, operation);
    try { await operation; }
    finally { if (seedSaveQueues.get(key) === operation) seedSaveQueues.delete(key); }
  }
  async create(seed: SeedState): Promise<void> {
    await Promise.all(['conversations', 'branches', 'decisions', 'research', 'harvest', 'harvest/results', 'history', '.backup'].map((directory) => ensureDir(path.join(this.base, directory))));
    await this.save(seed);
  }
  async appendConversation(entry: ConversationEntry): Promise<void> {
    const validated = conversationSchema.parse(entry);
    await atomicWrite(path.join(this.base, 'conversations', `${validated.id}.json`), `${JSON.stringify(validated, null, 2)}\n`);
  }
  async conversations(seedId: string): Promise<ConversationEntry[]> {
    const files = await listFiles(path.join(this.base, 'conversations'));
    const values: ConversationEntry[] = [];
    for (const file of files) { try { const v = conversationSchema.parse(await readJson<unknown>(file)); if (v.seedId === seedId) values.push(v); } catch { /* ignore corrupt unrelated files */ } }
    return values.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async saveBranch(branch: Branch): Promise<void> {
    const validated = branchSchema.parse(branch);
    await atomicWrite(path.join(this.base, 'branches', `${validated.id}.json`), `${JSON.stringify(validated, null, 2)}\n`);
  }
  async branches(seedId: string): Promise<Branch[]> {
    const files = await listFiles(path.join(this.base, 'branches')); const values: Branch[] = [];
    for (const file of files) { try { const v = branchSchema.parse(await readJson<unknown>(file)); if (v.seedId === seedId) values.push(v); } catch { /* ignore */ } }
    return values.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async saveDecision(decision: Decision): Promise<void> {
    const validated = decisionSchema.parse(decision);
    await atomicWrite(path.join(this.base, 'decisions', `${validated.id}.json`), `${JSON.stringify(validated, null, 2)}\n`);
  }
  async decisions(seedId: string): Promise<Decision[]> {
    const files = await listFiles(path.join(this.base, 'decisions')); const values: Decision[] = [];
    for (const file of files) {
      try { const value = decisionSchema.parse(await readJson<unknown>(file)); if (value.seedId === seedId) values.push(value); } catch { /* ignore corrupt unrelated files */ }
    }
    return values.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async appendEvent(event: GrowthEvent): Promise<void> { await appendJsonLine(path.join(this.base, 'history', 'events.jsonl'), growthEventSchema.parse(event)); }
  async events(seedId: string): Promise<GrowthEvent[]> {
    const file = path.join(this.base, 'history', 'events.jsonl'); if (!(await exists(file))) return [];
    const text = await (await import('node:fs/promises')).readFile(file, 'utf8'); const events: GrowthEvent[] = [];
    for (const line of text.split(/\r?\n/).filter(Boolean)) { try { const v = growthEventSchema.parse(JSON.parse(line) as unknown); if (v.seedId === seedId) events.push(v); } catch { /* ignore malformed event */ } }
    return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async saveResearch(entry: ResearchEntry): Promise<void> {
    const validated = researchSchema.parse(entry);
    await atomicWrite(path.join(this.base, 'research', `${validated.id}.json`), `${JSON.stringify(validated, null, 2)}\n`);
  }
  async research(seedId: string): Promise<ResearchEntry[]> {
    const files = await listFiles(path.join(this.base, 'research')); const values: ResearchEntry[] = [];
    for (const file of files) { try { const value = researchSchema.parse(await readJson<unknown>(file)); if (value.seedId === seedId) values.push(value); } catch { /* ignore corrupt unrelated files */ } }
    return values.sort((a, b) => a.retrievedAt.localeCompare(b.retrievedAt));
  }
  async saveHarvestResult(result: HarvestResult): Promise<void> {
    const validated = harvestResultSchema.parse(result);
    await atomicWrite(path.join(this.base, 'harvest', 'results', `${validated.id}.json`), `${JSON.stringify(validated, null, 2)}\n`);
  }
  async harvestResults(seedId: string): Promise<HarvestResult[]> {
    const files = await listFiles(path.join(this.base, 'harvest', 'results')); const values: HarvestResult[] = [];
    for (const file of files) { try { const value = harvestResultSchema.parse(await readJson<unknown>(file)); if (value.seedId === seedId) values.push(value); } catch { /* ignore corrupt unrelated files */ } }
    return values.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export async function openStore(): Promise<SeedStore> { return new SeedStore(await ensureSeedRoot()); }

export type GlobalConfig = {
  version: number; lang?: 'en' | 'ko'; activeProvider: string; providers: ProviderConfig[]; setupCompleted?: boolean;
};
export type ProviderConfig = {
  id: string; name: string; type: 'openai' | 'gemini' | 'anthropic' | 'custom';
  defaultModel: string; baseUrl?: string; enabled: boolean; connectionMode?: 'api-key' | 'oauth';
  temperature?: number; maxTokens?: number;
};
const defaultConfig: GlobalConfig = { version: 1, activeProvider: 'local', providers: [
  { id: 'local', name: 'Local fallback', type: 'custom', defaultModel: 'rule-based', enabled: true },
] };
function sanitizeProvider(provider: ProviderConfig): ProviderConfig {
  const safe = { ...provider } as Record<string, unknown>;
  // Keys and bearer tokens belong in environment variables or the dedicated
  // OAuth auth file, never in config.json. Strip legacy/manual fields on both
  // load and save so a stale config cannot leak them through `config list`.
  for (const field of ['apiKey', 'api_key', 'token', 'accessToken', 'refreshToken', 'oauthTokens', 'credentials']) delete safe[field];
  return safe as ProviderConfig;
}
function normalizeConfig(config: GlobalConfig): GlobalConfig {
  const providers = (Array.isArray(config.providers) ? config.providers : [])
    .map((provider) => {
      if (!provider || typeof provider !== 'object') return undefined;
      const value = sanitizeProvider(provider);
      if (!value.id || !value.name || !value.defaultModel || !['openai', 'gemini', 'anthropic', 'custom'].includes(value.type)
        || (value.enabled !== undefined && typeof value.enabled !== 'boolean')
        || (value.baseUrl !== undefined && typeof value.baseUrl !== 'string')
        || (value.connectionMode !== undefined && !['api-key', 'oauth'].includes(value.connectionMode))) return undefined;
      return {
        ...value,
        enabled: value.enabled !== false,
        ...(value.temperature !== undefined && Number.isFinite(value.temperature) ? { temperature: value.temperature } : {}),
        ...(value.maxTokens !== undefined && Number.isInteger(value.maxTokens) && value.maxTokens > 0 ? { maxTokens: value.maxTokens } : {}),
      } as ProviderConfig;
    })
    .filter((provider): provider is ProviderConfig => Boolean(provider));
  const withLocal = providers.some((provider) => provider.id === 'local')
    ? providers
    : [{ ...defaultConfig.providers[0]! }, ...providers];
  const activeProvider = typeof config.activeProvider === 'string' && withLocal.some((provider) => provider.id === config.activeProvider)
    ? config.activeProvider
    : 'local';
  const language = config.lang === 'ko' || config.lang === 'en' ? config.lang : undefined;
  return {
    ...config,
    version: Number.isFinite(config.version) ? config.version : defaultConfig.version,
    ...(language ? { lang: language } : { lang: undefined }),
    activeProvider,
    providers: withLocal.map((provider) => {
      const safe = sanitizeProvider(provider);
      return safe.type === 'openai' && safe.connectionMode === 'oauth' && safe.defaultModel === 'gpt-5.3-codex'
        ? { ...safe, defaultModel: 'gpt-5.6-luna' } : safe;
    }),
  };
}
export async function configPath(): Promise<string> {
  const home = process.env.SEED_HOME ?? path.join(os.homedir(), '.seed'); await ensureDir(home); return path.join(home, 'config.json');
}
/** Return the nearest project's optional configuration override path. */
export async function projectConfigPath(start = process.cwd()): Promise<string | undefined> {
  const projectRoot = await findSeedRoot(start);
  return projectRoot ? path.join(projectRoot, '.seed', 'config.json') : undefined;
}
export async function loadConfig(): Promise<GlobalConfig> {
  const file = await configPath();
  let global: GlobalConfig = { ...defaultConfig, providers: [...defaultConfig.providers] };
  if (await exists(file)) {
    try { const parsed = await readJson<Partial<GlobalConfig>>(file); global = { ...global, ...parsed, providers: parsed.providers ?? global.providers }; } catch { /* fall back to defaults */ }
  }
  const projectRoot = await findSeedRoot(process.cwd()) ?? process.cwd();
  const projectFile = path.join(projectRoot, '.seed', 'config.json');
  if (await exists(projectFile)) {
    try { const project = await readJson<Partial<GlobalConfig>>(projectFile); return normalizeConfig({ ...global, ...project, providers: project.providers ?? global.providers }); } catch { /* ignore invalid project override */ }
  }
  return normalizeConfig(global);
}
export async function saveConfig(config: GlobalConfig): Promise<void> { await atomicWrite(await configPath(), `${JSON.stringify(normalizeConfig(config), null, 2)}\n`); }
/** Save a project-scoped override without ever writing credentials. */
export async function saveProjectConfig(config: GlobalConfig, start = process.cwd()): Promise<boolean> {
  const file = await projectConfigPath(start);
  if (!file) return false;
  await atomicWrite(file, `${JSON.stringify(normalizeConfig(config), null, 2)}\n`);
  return true;
}
