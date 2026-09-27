import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/domain.js';
import { bloomPrompt, branchPrompt, sunlightPrompt, waterDetailPrompt } from '../src/ai/prompts/shape.js';
import { buildContext } from '../src/ai/context-builder.js';
import { growthQuestionPrompt, growthUpdatePrompt } from '../src/ai/prompts/growth.js';
import { growthIntentPrompt, providerInstructions } from '../src/ai/prompts/system.js';

describe('shape prompts', () => {
  it('keeps the response contracts and user evidence in their prompts', () => {
    const seed = { ...createSeed('A small idea'), problem: 'A real problem', users: ['Newcomers'] };
    expect(branchPrompt(seed)).toContain('BRANCH_SUGGEST');
    expect(sunlightPrompt(seed, 'A cited source')).toContain('webSources: A cited source');
    expect(waterDetailPrompt(seed, { id: 'user', name: 'User', question: 'What happens?' })).toContain('question: What happens?');
    expect(bloomPrompt(seed, '')).toContain('Include all eight dimensions');
  });
});

describe('growth prompts', () => {
  it('keeps scoped context and response contracts outside provider transport', () => {
    const seed = createSeed('A small idea');
    const context = buildContext(seed, 'grow');
    expect(growthQuestionPrompt(seed, context, [], true)).toContain('The user found the previous question difficult.');
    expect(growthQuestionPrompt(seed, context, [], false)).toContain('"focus":"user|problem|goal|constraint|assumption|validation"');
    expect(growthUpdatePrompt(seed, context, 'A user answer')).toContain('latestAnswer: A user answer');
  });

  it('keeps intent and provider instructions explicit', () => {
    expect(growthIntentPrompt('What matters?', 'I need help')).toContain('latestUserText: I need help');
    expect(providerInstructions('ko')).toContain('Respond in Korean');
  });
});
