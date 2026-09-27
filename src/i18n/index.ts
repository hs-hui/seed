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
  if (explicit !== undefined) return setLanguage(explicit === 'ko' || explicit === 'en' ? explicit : 'en');
  const env = process.env.SEED_LANG;
  if (env !== undefined) return setLanguage(env === 'ko' || env === 'en' ? env : 'en');
  const config = await loadConfig();
  if (config.lang) return setLanguage(config.lang);
  // English is the product default when no explicit locale is available.
  return setLanguage('en');
}
export function currentLanguage(): Language { return selectedLanguage ?? 'en'; }
export function t(key: string, vars: Record<string, string | number> = {}, lang = currentLanguage()): string {
  let value = catalogs[lang][key] ?? catalogs.en[key] ?? key;
  for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}
