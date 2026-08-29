import { SeedState, Branch, MaturityDimension } from '../domain.js';
import { loadConfig, ProviderConfig } from '../storage/store.js';
import { buildContext } from './context-builder.js';

export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  ask(prompt: string): Promise<string>;
}

export class LocalProvider implements LLMProvider {
  readonly id = 'local';
  readonly model = 'rule-based';
  async ask(prompt: string): Promise<string> {
    if (prompt.includes('BRANCH_SUGGEST')) return JSON.stringify({ branches: [
      { name: 'Focused workflow', summary: 'Solve the narrowest, most valuable use case first.' },
      { name: 'Guided experience', summary: 'Turn the idea into a step-by-step experience for the target user.' },
      { name: 'Developer platform', summary: 'Expose the core value as an extensible tool or API.' },
    ] });
    if (prompt.includes('PRUNE_SUGGEST')) return JSON.stringify({ items: [
      { item: 'Team collaboration', reason: 'Adds coordination scope before the core workflow is proven.' },
      { item: 'Mobile application', reason: 'Creates a second surface that is not required for the first proof.' },
      { item: 'Advanced integrations', reason: 'Can wait until the primary user loop is useful.' },
    ] });
    const question = prompt.includes('problem: \n')
      ? 'Who is the first person this should help, and what is their most painful moment?'
      : prompt.includes('openQuestions:') && !prompt.endsWith('openQuestions: ')
        ? 'Which open question is most important to answer before building?'
        : prompt.includes('users: \n')
          ? 'Who should experience the first useful version of this idea?'
          : 'What is the next concrete outcome a user should get from this idea?';
    return JSON.stringify({ question, maturityDelta: 3 });
  }
}

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(public readonly config: ProviderConfig, private readonly apiKey: string) {}
  get id(): string { return this.config.id; }
  get model(): string { return this.config.defaultModel; }
  async ask(prompt: string): Promise<string> {
    if (this.config.type === 'gemini') return this.askGemini(prompt);
    if (this.config.type === 'anthropic') return this.askAnthropic(prompt);
    const base = this.config.baseUrl ?? 'https://api.openai.com/v1';
    const response = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.config.defaultModel, temperature: 0.7, messages: [
        { role: 'system', content: 'You are Seed, a careful gardener for ideas. Return concise JSON when requested.' },
        { role: 'user', content: prompt },
      ] }),
    });
    if (!response.ok) throw new Error(`provider request failed (${response.status})`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? '';
  }
  private async askGemini(prompt: string): Promise<string> {
    const endpoint = `${this.config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'}/models/${this.config.defaultModel}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    if (!response.ok) throw new Error(`provider request failed (${response.status})`);
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }
  private async askAnthropic(prompt: string): Promise<string> {
    const endpoint = `${this.config.baseUrl ?? 'https://api.anthropic.com/v1'}/messages`;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: this.config.defaultModel, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }) });
    if (!response.ok) throw new Error(`provider request failed (${response.status})`);
    const data = await response.json() as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? '';
  }
}

function keyFor(provider: ProviderConfig): string | undefined {
  if (provider.type === 'openai') return process.env.SEED_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (provider.type === 'gemini') return process.env.SEED_GEMINI_API_KEY;
  if (provider.type === 'anthropic') return process.env.SEED_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  return process.env.SEED_API_KEY;
}

export async function getProvider(id?: string, model?: string): Promise<LLMProvider> {
  const config = await loadConfig(); const selected = config.providers.find((p) => p.id === (id ?? config.activeProvider));
  if (!selected || selected.id === 'local') return new LocalProvider();
  const key = keyFor(selected);
  const resolved = model ? { ...selected, defaultModel: model } : selected;
  return key ? new OpenAICompatibleProvider(resolved, key) : new LocalProvider();
}

export type GrowthSuggestion = { question: string; maturityDelta: number };
export async function nextQuestion(seed: SeedState, providerId?: string, model?: string): Promise<GrowthSuggestion> {
  const provider = await getProvider(providerId, model);
  let response = '';
  try {
    const context = buildContext(seed, 'grow');
    response = await provider.ask(`GROW_QUESTION\ncoreIdea: ${context.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\nopenQuestions: ${context.openQuestions.map((q) => q.question).join(' | ')}`);
  } catch {
    response = await new LocalProvider().ask(`GROW_QUESTION\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\nopenQuestions: `);
  }
  try { const parsed = JSON.parse(response) as Partial<GrowthSuggestion>; if (parsed.question) return { question: parsed.question, maturityDelta: parsed.maturityDelta ?? 3 }; } catch { /* fallback */ }
  return { question: 'What is the next concrete outcome a user should get from this idea?', maturityDelta: 3 };
}
export async function suggestBranches(seed: SeedState, providerId?: string, model?: string): Promise<Array<{ name: string; summary: string }>> {
  const provider = await getProvider(providerId, model); let response = '';
  try { response = await provider.ask(`BRANCH_SUGGEST\ncoreIdea: ${seed.coreIdea}`); } catch { response = await new LocalProvider().ask('BRANCH_SUGGEST'); }
  try { const parsed = JSON.parse(response) as { branches?: Array<{ name: string; summary: string }> }; if (parsed.branches?.length) return parsed.branches.slice(0, 4); } catch { /* fallback */ }
  return [{ name: 'Focused workflow', summary: seed.coreIdea }];
}
export async function suggestPrune(seed: SeedState, providerId?: string, model?: string): Promise<Array<{ item: string; reason: string }>> {
  const provider = await getProvider(providerId, model); let response = '';
  try { response = await provider.ask(`PRUNE_SUGGEST\ncoreIdea: ${seed.coreIdea}`); } catch { response = await new LocalProvider().ask('PRUNE_SUGGEST'); }
  try { const parsed = JSON.parse(response) as { items?: Array<{ item: string; reason: string }> }; if (parsed.items?.length) return parsed.items; } catch { /* fallback */ }
  return [];
}

export function dimensionsFor(seed: SeedState): MaturityDimension[] {
  const hasProblem = Boolean(seed.problem);
  const hasUser = seed.users.length > 0;
  const hasGoals = seed.goals.length > 0;
  const hasBranch = seed.branches.length > 0;
  const base: Record<string, number> = { problem: hasProblem ? 70 : 25, user: hasUser ? 70 : 20, 'core value': hasGoals ? 65 : 30, differentiation: hasBranch ? 55 : 25, scope: seed.prunedItems.length ? 70 : 40, feasibility: 45, motivation: 65, confidence: seed.decisions.length ? 65 : 35 };
  return seed.maturityDimensions.map((d) => ({ ...d, score: base[d.name] ?? d.score, reason: (base[d.name] ?? d.score) >= 60 ? 'Supported by the current seed state.' : 'Needs another focused growth turn.' }));
}
