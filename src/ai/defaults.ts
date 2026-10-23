// Single source for non-OpenAI default models; the setup wizard and `config set provider` both read it so they cannot drift.
// DEFAULT_OPENAI_MODEL stays in transport.ts because the OAuth and API-key transports share it.
export const PROVIDER_DEFAULT_MODELS: Record<'anthropic' | 'gemini', string> = { anthropic: 'claude-sonnet-5-5', gemini: 'gemini-2.5-flash' };
