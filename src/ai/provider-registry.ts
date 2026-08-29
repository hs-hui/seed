import { LLMProvider } from './provider.js';

export class ProviderRegistry {
  private readonly providers = new Map<string, LLMProvider>();
  register(provider: LLMProvider): void { this.providers.set(provider.id, provider); }
  get(id: string): LLMProvider | undefined { return this.providers.get(id); }
  list(): LLMProvider[] { return [...this.providers.values()]; }
}
