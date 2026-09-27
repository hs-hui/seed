import type { Command } from 'commander';
import { t, currentLanguage, setLanguage } from '../i18n/index.js';
import { loadConfig } from '../storage/store.js';
import { DEFAULT_OPENAI_MODEL, DEFAULT_OPENAI_OAUTH_MODEL, getProvider, providerKey, testProviderConnection } from '../ai/provider.js';
import { loginOpenAI } from '../ai/openai-oauth.js';
import { configWizard, configuredCredential, missingCredentialMessage, persistConfig } from './config-setup.js';

export type CommonOptions = { lang?: string; json?: boolean; provider?: string; model?: string; seed?: string; branch?: string; setup?: boolean; web?: boolean; input?: boolean; since?: string };

type ConfigCommandDeps = {
  run: (action: () => Promise<void>, options: CommonOptions) => Promise<void>;
  jsonRequested: (options?: CommonOptions) => boolean;
  print: (value: unknown, json?: boolean) => void;
};

/** Register the `config` command and its subcommands on the given program. */
export function registerConfigCommands(program: Command, deps: ConfigCommandDeps): void {
  const { run, jsonRequested, print } = deps;
  const config = program.command('config').description(t('help.config')).option('--lang <lang>', t('cli.langOption')).option('--json', t('cli.jsonOption')).option('--no-input', t('cli.noInputOption'));
  function configFailure(options: CommonOptions, message: string, code: string): void {
    if (jsonRequested(options)) print({ error: code, message }, true);
    else console.log(message);
    process.exitCode = 1;
  }
  config.action(async (options: CommonOptions) => run(async () => { if (process.stdin.isTTY && options.input !== false && !jsonRequested(options)) await configWizard(); else { const value = await loadConfig(); print({ ...value, envKeys: ['OPENAI_API_KEY', 'SEED_GEMINI_API_KEY', 'GEMINI_API_KEY', 'SEED_ANTHROPIC_API_KEY', 'SEED_API_KEY'] }, jsonRequested(options)); } }, options));
  config.command('list').description(t('cli.configList')).action(async (options: CommonOptions) => run(async () => { const value = await loadConfig(); print(value, jsonRequested(options)); }, options));
  config.command('use').argument('<provider>').description(t('cli.configUse')).action(async (provider: string, options: CommonOptions) => run(async () => {
    const value = await loadConfig(); const selected = value.providers.find((entry) => entry.id === provider);
    if (!selected) throw new Error(t('error.invalidProvider', { provider }));
    const credential = await configuredCredential(selected);
    if (!credential) { configFailure(options, missingCredentialMessage(selected), 'provider-credential-missing'); return; }
    try { await testProviderConnection(selected, currentLanguage(), credential); }
    catch (error) { configFailure(options, t('config.connectionFailed', { message: error instanceof Error ? error.message : String(error) }), 'provider-connection-failed'); return; }
    selected.enabled = true;
    value.activeProvider = provider; await persistConfig(value); print(jsonRequested(options) ? { activeProvider: provider } : t('config.active', { provider }), jsonRequested(options));
  }, options));
  config.command('set').argument('<key>').argument('<value>').description(t('cli.configSet')).action(async (key: string, valueArg: string, options: CommonOptions) => run(async () => {
    const value = await loadConfig();
    if (key === 'lang') { if (valueArg !== 'ko' && valueArg !== 'en') throw new Error('invalid-language'); value.lang = valueArg; setLanguage(valueArg); await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options)); return; }
    if (key === 'provider') {
      if (!value.providers.some((p) => p.id === valueArg)) {
        const known = valueArg === 'openai' ? { type: 'openai' as const, model: DEFAULT_OPENAI_MODEL } : valueArg === 'gemini' ? { type: 'gemini' as const, model: 'gemini-2.5-flash' } : valueArg === 'anthropic' ? { type: 'anthropic' as const, model: 'claude-3-5-sonnet-latest' } : { type: 'custom' as const, model: 'default' };
        value.providers.push({ id: valueArg, name: valueArg, type: known.type, defaultModel: known.model, enabled: true, ...(known.type === 'openai' ? { connectionMode: 'api-key' as const } : {}) });
      }
      const configured = value.providers.find((provider) => provider.id === valueArg);
      // `config set provider openai` is the explicit way to switch an existing
      // account profile back to API-key mode. Prefer an available API key here;
      // otherwise preserve OAuth and read its local account credential.
      const apiKey = configured?.type === 'openai' ? providerKey(configured) : undefined;
      const credential = configured ? apiKey ?? await configuredCredential(configured) : undefined;
      if (configured && !credential) { configFailure(options, missingCredentialMessage(configured), 'provider-credential-missing'); return; }
      if (configured) {
        const testConfig = apiKey && configured.type === 'openai' ? { ...configured, connectionMode: 'api-key' as const } : configured;
        try { await testProviderConnection(testConfig, currentLanguage(), credential); }
        catch (error) { configFailure(options, t('config.connectionFailed', { message: error instanceof Error ? error.message : String(error) }), 'provider-connection-failed'); return; }
      }
      if (configured) {
        configured.enabled = true;
        if (configured.type === 'openai' && apiKey) configured.connectionMode = 'api-key';
      }
      value.activeProvider = valueArg; await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options)); return;
    }
    if (key === 'model' || key === 'baseUrl') {
      if (!valueArg.trim()) throw new Error(key === 'baseUrl' ? 'base-url-required' : 'invalid-model-setting');
      const active = value.providers.find((p) => p.id === value.activeProvider);
      if (!active) throw new Error(t('error.invalidProvider', { provider: value.activeProvider }));
      const candidate = key === 'model' ? { ...active, defaultModel: valueArg } : { ...active, baseUrl: valueArg };
      const credential = await configuredCredential(candidate);
      if (!credential) { configFailure(options, missingCredentialMessage(candidate), 'provider-credential-missing'); return; }
      try { await testProviderConnection(candidate, currentLanguage(), credential); }
      catch (error) { configFailure(options, t('config.connectionFailed', { message: error instanceof Error ? error.message : String(error) }), 'provider-connection-failed'); return; }
      Object.assign(active, candidate); await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options)); return;
    }
    if (key === 'temperature' || key === 'maxTokens') {
      const number = Number(valueArg);
      const valid = Number.isFinite(number) && (key === 'temperature' ? number >= 0 && number <= 2 : Number.isInteger(number) && number > 0 && number <= 200_000);
      if (!valid) throw new Error('invalid-model-setting');
      const active = value.providers.find((p) => p.id === value.activeProvider);
      if (!active) throw new Error(t('error.invalidProvider', { provider: value.activeProvider }));
      const candidate = { ...active, [key]: number };
      const credential = await configuredCredential(candidate);
      if (!credential) { configFailure(options, missingCredentialMessage(candidate), 'provider-credential-missing'); return; }
      try { await testProviderConnection(candidate, currentLanguage(), credential); }
      catch (error) { configFailure(options, t('config.connectionFailed', { message: error instanceof Error ? error.message : String(error) }), 'provider-connection-failed'); return; }
      Object.assign(active, candidate); await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options)); return;
    }
    throw new Error(t('error.unknownConfigKey', { key }));
  }, options));
  config.command('unset').argument('<key>').description(t('cli.configUnset')).action(async (key: string, options: CommonOptions) => run(async () => {
    const value = await loadConfig();
    if (key === 'lang') delete value.lang;
    else throw new Error(t('error.unknownConfigKey', { key }));
    await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options));
  }, options));
  config.command('test').description(t('cli.configTest')).action(async (options: CommonOptions) => run(async () => {
    const value = await loadConfig(); const active = value.providers.find((p) => p.id === value.activeProvider);
    if (!active) { configFailure(options, t('error.aiProviderRequired'), 'ai-provider-required'); return; }
    const key = await configuredCredential(active);
    if (!key) { configFailure(options, missingCredentialMessage(active), 'provider-credential-missing'); return; }
    try { await testProviderConnection(active, currentLanguage(), key); print(jsonRequested(options) ? { success: true, provider: active.id } : t('config.keyConfigured', { provider: active.id }), jsonRequested(options)); }
    catch (error) { configFailure(options, t('config.connectionFailed', { message: error instanceof Error ? error.message : String(error) }), 'provider-connection-failed'); }
  }, options));
  config.command('bench').description(t('cli.configBench')).option('--prompt <text>', t('cli.benchPromptOption')).option('--json', t('cli.jsonOption')).action(async (options: { prompt?: string; json?: boolean }) => run(async () => {
    const value = await loadConfig();
    const results: Array<{ provider: string; model: string; status: 'ok' | 'missing' | 'failed'; latencyMs?: number; error?: string }> = [];
    for (const candidate of value.providers.filter((provider) => provider.enabled !== false)) {
      const credential = await configuredCredential(candidate);
      if (!credential) { results.push({ provider: candidate.id, model: candidate.defaultModel, status: 'missing' }); continue; }
      const started = Date.now();
      try {
        const provider = await getProvider(candidate.id, candidate.defaultModel, currentLanguage());
        const response = await provider.ask(options.prompt?.trim() || 'Reply with the single word OK.');
        if (!response.trim()) throw new Error(t('error.providerEmptyResponse'));
        results.push({ provider: candidate.id, model: provider.model, status: 'ok', latencyMs: Date.now() - started });
      } catch (error) {
        results.push({ provider: candidate.id, model: candidate.defaultModel, status: 'failed', latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (jsonRequested(options)) print(results, true);
    else { console.log(t('config.benchTitle')); for (const result of results) console.log(`${result.provider} (${result.model}): ${t(`config.benchStatus.${result.status}`)}${result.latencyMs === undefined ? '' : ` — ${result.latencyMs}ms`}${result.error ? ` — ${result.error}` : ''}`); }
  }, options as CommonOptions));
  config.command('login').argument('<provider>').description(t('cli.configLogin')).action(async (provider: string, options: CommonOptions) => run(async () => {
    if (provider !== 'openai') throw new Error(t('error.onlyOpenAIAccount'));
    await loginOpenAI(currentLanguage(), jsonRequested(options)); const value = await loadConfig(); const existing = value.providers.find((entry) => entry.id === 'openai');
    const configuredModel = process.env.SEED_OPENAI_OAUTH_MODEL?.trim();
    const defaultModel = configuredModel && configuredModel !== 'gpt-5.3-codex'
      ? configuredModel
      : existing?.connectionMode === 'oauth' && existing.defaultModel && existing.defaultModel !== 'gpt-5.3-codex'
        ? existing.defaultModel : DEFAULT_OPENAI_OAUTH_MODEL;
    const openai = { ...(existing ?? { id: 'openai', name: 'openai', type: 'openai' as const, enabled: true }), enabled: true, defaultModel, connectionMode: 'oauth' as const };
    await testProviderConnection(openai, currentLanguage());
    value.providers = [...value.providers.filter((entry) => entry.id !== 'openai'), openai]; value.activeProvider = 'openai'; await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options));
  }, options));
  config.command('remove').argument('<provider>').description(t('cli.configRemove')).action(async (provider: string, options: CommonOptions) => run(async () => {
    const value = await loadConfig();
    if (!value.providers.some((entry) => entry.id === provider)) throw new Error(`provider-not-configured:${provider}`);
    value.providers = value.providers.filter((p) => p.id !== provider); if (value.activeProvider === provider) value.activeProvider = ''; await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options));
  }, options));
}
