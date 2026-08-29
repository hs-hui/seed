import en from './en.json' with { type: 'json' };
import ko from './ko.json' with { type: 'json' };
import { loadConfig } from '../storage/store.js';

export type Language = 'en' | 'ko';
type Catalog = Record<string, string>;
const catalogs: Record<Language, Catalog> = { en, ko };
let selectedLanguage: Language | undefined;

export function setLanguage(language?: string): Language {
  selectedLanguage = language === 'ko' ? 'ko' : language === 'en' ? 'en' : undefined;
  return selectedLanguage ?? 'en';
}
export async function initializeLanguage(explicit?: string): Promise<Language> {
  if (explicit === 'ko' || explicit === 'en') return setLanguage(explicit);
  const env = process.env.SEED_LANG;
  if (env === 'ko' || env === 'en') return setLanguage(env);
  const config = await loadConfig();
  if (config.lang) return setLanguage(config.lang);
  const locale = process.env.LANG ?? process.env.LC_ALL ?? '';
  return setLanguage(/^ko/i.test(locale) ? 'ko' : 'en');
}
export function currentLanguage(): Language { return selectedLanguage ?? 'en'; }
export function t(key: string, vars: Record<string, string | number> = {}, lang = currentLanguage()): string {
  let value = catalogs[lang][key] ?? catalogs.en[key] ?? key;
  for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}
