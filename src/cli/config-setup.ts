import { input, select } from '@inquirer/prompts';
import { currentLanguage, t } from '../i18n/index.js';
import { loadConfig, loadGlobalConfig, projectConfigPath, saveConfig, saveProjectConfig, type GlobalConfig, type ProviderConfig } from '../storage/store.js';
import { DEFAULT_OPENAI_MODEL, DEFAULT_OPENAI_OAUTH_MODEL, providerKey, testProviderConnection } from '../ai/provider.js';
import { getOpenAIToken, loginOpenAI } from '../ai/openai-oauth.js';

export function credentialEnvName(provider: ProviderConfig): string {
  if (provider.type === 'openai') return 'OPENAI_API_KEY';
  if (provider.type === 'gemini') return 'GEMINI_API_KEY';
  if (provider.type === 'anthropic') return 'ANTHROPIC_API_KEY';
  const suffix = provider.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return `SEED_${suffix}_API_KEY`;
}
export function missingCredentialMessage(provider: ProviderConfig): string {
  return provider.type === 'openai' && provider.connectionMode === 'oauth'
    ? t('config.oauthMissing')
    : t('config.emptyKey', { env: credentialEnvName(provider) });
}
export async function configuredCredential(provider: ProviderConfig): Promise<string | undefined> {
  if (provider.type === 'openai' && provider.connectionMode === 'oauth') return getOpenAIToken();
  return providerKey(provider);
}
/**
 * Persist settings. Inside a Seed project only the language and the provider
 * choice stay local; provider definitions decide where API keys are sent, so
 * they always go to the user-owned global config.
 */
export async function persistConfig(config: GlobalConfig): Promise<void> {
  if (!(await projectConfigPath())) { await saveConfig(config); return; }
  const global = await loadGlobalConfig();
  // A first setup run inside a project still needs usable global defaults:
  // setupCompleted is saved globally, so later runs elsewhere will not ask
  // for the language again and must not silently fall back to English.
  const keepActive = config.providers.some((provider) => provider.id === global.activeProvider && provider.enabled !== false);
  await saveConfig({ ...global, version: config.version, setupCompleted: config.setupCompleted, providers: config.providers,
    activeProvider: keepActive ? global.activeProvider : config.activeProvider, lang: global.lang ?? config.lang });
  await saveProjectConfig(config);
}

export async function configWizard(): Promise<void> {
  const current = await loadConfig();
  current.lang = currentLanguage();
  current.setupCompleted = true;
  const selected = await select({ message: t('config.chooseProvider'), choices: [
    { name: t('config.provider.openaiKey'), value: 'openai' },
    { name: t('config.provider.openaiAccount'), value: 'openai-oauth' },
    { name: t('config.provider.gemini'), value: 'gemini' },
    { name: t('config.provider.anthropic'), value: 'anthropic' },
    { name: t('config.provider.custom'), value: 'custom' },
  ] });
  if (selected === 'openai-oauth') {
    console.log(t('config.oauthExperimental'));
    const configuredModel = process.env.SEED_OPENAI_OAUTH_MODEL?.trim();
    const defaultOAuthModel = configuredModel === 'gpt-5.3-codex' ? DEFAULT_OPENAI_OAUTH_MODEL : configuredModel || DEFAULT_OPENAI_OAUTH_MODEL;
    const enteredModel = (await input({ message: t('config.model'), default: defaultOAuthModel })).trim();
    const oauthModel = enteredModel === 'gpt-5.3-codex' ? DEFAULT_OPENAI_OAUTH_MODEL : enteredModel || defaultOAuthModel;
    await loginOpenAI(currentLanguage());
    const existing = current.providers.find((provider) => provider.id === 'openai');
    const oauthProvider = {
      ...(existing ?? { id: 'openai', name: 'openai', type: 'openai' as const, defaultModel: oauthModel, enabled: true }),
      enabled: true, defaultModel: oauthModel, connectionMode: 'oauth' as const,
    };
    try { await testProviderConnection(oauthProvider, currentLanguage()); }
    catch (error) { throw new Error(`ai-connection-failed:${error instanceof Error ? error.message : String(error)}`); }
    current.providers = [...current.providers.filter((entry) => entry.id !== 'openai'), oauthProvider];
    current.activeProvider = 'openai';
    await persistConfig(current);
    console.log(t('config.saved'));
    return;
  }
  const id = selected === 'custom' ? (await input({ message: t('config.providerId'), default: 'custom-1' })).trim() || 'custom-1' : selected;
  const baseUrl = selected === 'custom' ? (await input({ message: t('config.baseUrl') })).trim() : undefined;
  if (selected === 'custom' && !baseUrl) { console.log(t('config.baseUrlRequired')); return; }
  const modelDefaults: Record<string, string> = { openai: DEFAULT_OPENAI_MODEL, gemini: 'gemini-2.5-flash', anthropic: 'claude-3-5-sonnet-latest' };
  const enteredModel = (await input({ message: t('config.model'), ...(modelDefaults[selected] ? { default: modelDefaults[selected] } : {}) })).trim();
  if (selected === 'custom' && !enteredModel) { console.log(t('config.modelRequired')); return; }
  const defaultModel = enteredModel || modelDefaults[selected] || 'default';
  const provider = { id, name: id, type: (selected === 'custom' ? 'custom' : selected) as 'openai' | 'gemini' | 'anthropic' | 'custom', defaultModel, enabled: true, ...(baseUrl ? { baseUrl } : {}), connectionMode: 'api-key' as const };
  const key = providerKey(provider);
  if (!key) { console.log(t('config.emptyKey', { env: credentialEnvName(provider) })); return; }
  try { await testProviderConnection(provider, currentLanguage(), key); }
  catch (error) { throw new Error(`ai-connection-failed:${error instanceof Error ? error.message : String(error)}`); }
  current.providers = [...current.providers.filter((entry) => entry.id !== id), provider];
  current.activeProvider = id;
  await persistConfig(current);
  console.log(t('config.saved'));
}
