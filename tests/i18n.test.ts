import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { currentLanguage, initializeLanguage, setLanguage, t } from '../src/i18n/index.js';

describe('CLI language defaults', () => {
  it('uses English unless Korean is explicitly selected', () => {
    setLanguage(undefined);
    expect(currentLanguage()).toBe('en');
    expect(t('bloom.title')).toContain('BLOOM');
    setLanguage('ko');
    expect(currentLanguage()).toBe('ko');
    expect(t('bloom.title')).toContain('개화');
    setLanguage('en');
  });

  it('falls back to English for an unknown language', async () => {
    await initializeLanguage('fr');
    expect(currentLanguage()).toBe('en');
    setLanguage('en');
  });

  it('localizes OAuth progress messages without changing the URL', () => {
    expect(t('oauth.loginUrl', { url: 'https://example.test' }, 'en')).toContain('OpenAI OAuth login URL: https://example.test');
    expect(t('oauth.loginUrl', { url: 'https://example.test' }, 'ko')).toContain('OpenAI OAuth 로그인 URL: https://example.test');
  });

  it('localizes the post-prune core summary', () => {
    expect(t('prune.core', {}, 'en')).toContain('core');
    expect(t('prune.core', {}, 'ko')).toContain('핵심');
  });

  it('keeps English as the fresh-session default regardless of host locale', async () => {
    const previousLang = process.env.LANG;
    const previousLcAll = process.env.LC_ALL;
    const previousHome = process.env.SEED_HOME;
    const emptyHome = await mkdtemp(path.join(os.tmpdir(), 'seed-i18n-'));
    process.env.LANG = 'ko_KR.UTF-8';
    process.env.LC_ALL = 'ko_KR.UTF-8';
    process.env.SEED_HOME = emptyHome;
    try {
      await initializeLanguage();
      expect(currentLanguage()).toBe('en');
    } finally {
      if (previousLang === undefined) delete process.env.LANG; else process.env.LANG = previousLang;
      if (previousLcAll === undefined) delete process.env.LC_ALL; else process.env.LC_ALL = previousLcAll;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      await rm(emptyHome, { recursive: true, force: true });
      setLanguage('en');
    }
  });
});
