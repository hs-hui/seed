import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROVIDER_DEFAULT_MODELS } from '../src/ai/defaults.js';

describe('provider default models', () => {
  it('pins current Anthropic and Gemini defaults', () => {
    expect(PROVIDER_DEFAULT_MODELS).toEqual({ anthropic: 'claude-sonnet-5-5', gemini: 'gemini-2.5-flash' });
  });

  it('keeps both CLI entry points on the shared map so the defaults cannot drift', () => {
    for (const file of ['src/cli/config-setup.ts', 'src/cli/config-commands.ts']) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(source, file).toContain('PROVIDER_DEFAULT_MODELS');
      expect(source, file).not.toContain('claude-3-5-sonnet-latest');
      expect(source, file).not.toContain("'gemini-2.5-flash'");
    }
  });
});
