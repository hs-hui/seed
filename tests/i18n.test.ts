import { describe, expect, it } from 'vitest';
import { currentLanguage, setLanguage, t } from '../src/i18n/index.js';

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
});
