import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ProviderLanguage } from '../src/ai/contracts.js';
import type { GrowthFocus, SeedState } from '../src/domain.js';
import { SeedStore } from '../src/storage/store.js';
import { addConversation, plant } from '../src/core/seed-manager.js';
import { applyGrowth } from '../src/core/growth.js';
import { assessHarvestReadiness } from '../src/core/harvest-readiness.js';
import { useScriptedProvider } from './test-support/scripted-provider.js';

type Fields = Pick<SeedState, 'users' | 'problem' | 'goals' | 'constraints' | 'assumptions'>;
const empty: Fields = { users: [], problem: '', goals: [], constraints: [], assumptions: [] };
const fieldsOf = ({ users, problem, goals, constraints, assumptions }: SeedState): Fields => ({ users, problem, goals, constraints, assumptions });

// Question wording often mentions another field ("처음", "누구", "who"), so
// only the asked question's focus may decide where an answer is filed.
describe('growth answer filing', () => {
  let stopScriptedProvider: () => Promise<void>;
  let root: string;
  beforeEach(async () => {
    stopScriptedProvider = await useScriptedProvider();
    root = await mkdtemp(path.join(os.tmpdir(), 'seed-field-filing-'));
  });
  afterEach(async () => {
    await stopScriptedProvider();
    await rm(root, { recursive: true, force: true });
  });

  /** Open one question with focus metadata, as askGrowthQuestion records it, and answer it. */
  async function answerQuestion(question: string, focus: GrowthFocus, answer: string, known: Partial<Fields> = {}, language: ProviderLanguage = 'en'): Promise<{ store: SeedStore; seed: SeedState }> {
    const store = new SeedStore(root);
    const planted = await plant(store, language === 'ko' ? '공부 앱' : 'A study app');
    await addConversation(store, { seedId: planted.id, role: 'assistant', type: 'question', content: question, metadata: { focus } });
    await store.save({ ...planted, ...known, openQuestions: [{ id: 'asked', seedId: planted.id, question, focus, importance: 'high', status: 'open', createdAt: planted.createdAt }] });
    const result = await applyGrowth(store, await store.load(), answer, 'openai', undefined, language);
    return { store, seed: result.seed };
  }

  it('files a Korean user answer only under users when the question says 처음', async () => {
    const { store, seed } = await answerQuestion('처음 이 아이디어를 써볼 사람은 누구예요?', 'user', '대학생들', {}, 'ko');
    expect(fieldsOf(seed)).toEqual({ ...empty, users: ['대학생들'] });
    expect(fieldsOf(await store.load())).toEqual(fieldsOf(seed));
    // A user answer is not scope evidence, so a PRD still needs a scope answer.
    expect(assessHarvestReadiness(seed, 'prd').missing).toContain('scope');
  });

  it.each([
    { users: ['처음 코딩을 배우는 대학생'], question: '"처음 코딩을 배우는 대학생"인 사람이 가장 답답하거나 막히는 순간은 언제예요?' },
    { users: ['대학생들'], question: '대학생들이 누구에게도 묻지 못하고 막히는 순간은 언제예요?' },
  ])('files a problem answer only as the problem: $question', async ({ users, question }) => {
    const answer = '과제 에러를 혼자 해결하지 못할 때';
    const { seed } = await answerQuestion(question, 'problem', answer, { users }, 'ko');
    expect(fieldsOf(seed)).toEqual({ ...empty, users, problem: answer });
  });

  it('files a goal answer only under goals when the question says who', async () => {
    const known = { users: ['College students'], problem: 'They get stuck on homework errors' };
    const { seed } = await answerQuestion('What should someone who tries it be able to do?', 'goal', 'Fix one error on their own', known);
    expect(fieldsOf(seed)).toEqual({ ...empty, ...known, goals: ['Fix one error on their own'] });
  });

  it('keeps a validation answer in the conversation without changing seed fields', async () => {
    const known: Fields = {
      users: ['College students'], problem: 'They get stuck on homework errors', goals: ['Fix one error on their own'],
      constraints: ['Python errors only'], assumptions: ['Students will paste their error message'],
    };
    const question = 'Whose positive reaction would reassure you?';
    const { store, seed } = await answerQuestion(question, 'validation', 'A teaching assistant', known);
    expect(fieldsOf(seed)).toEqual(known);
    expect(fieldsOf(await store.load())).toEqual(known);
    expect(seed.openQuestions.find((entry) => entry.question === question)).toMatchObject({ status: 'answered', answer: 'A teaching assistant' });
    expect((await store.conversations(seed.id)).filter((entry) => entry.role === 'user' && entry.type === 'answer').map((entry) => entry.content)).toEqual(['A teaching assistant']);
  });

  // Every question also contains a word that hints at another field.
  it.each<{ focus: GrowthFocus; field?: keyof Fields; question: string; answer: string; language: ProviderLanguage }>([
    { focus: 'user', field: 'users', question: 'Who runs into this problem most often?', answer: 'College students', language: 'en' },
    { focus: 'problem', field: 'problem', question: '처음 써볼 사람이 가장 답답한 순간은 언제예요?', answer: '에러 메시지를 이해하지 못할 때', language: 'ko' },
    { focus: 'goal', field: 'goals', question: '처음 써본 뒤 무엇을 할 수 있으면 좋을까요?', answer: '혼자 에러를 고칠 수 있으면 좋겠어요', language: 'ko' },
    { focus: 'constraint', field: 'constraints', question: 'Who should we help first?', answer: 'Only students in an intro Python class', language: 'en' },
    { focus: 'assumption', field: 'assumptions', question: 'Who could tell you whether this idea makes sense?', answer: 'A teaching assistant would know', language: 'en' },
    { focus: 'validation', question: '누가 써보고 좋다고 말하면 안심될까요?', answer: '담당 조교', language: 'ko' },
  ])('files a $focus answer into at most its own field', async ({ focus, field, question, answer, language }) => {
    const { seed } = await answerQuestion(question, focus, answer, {}, language);
    expect(fieldsOf(seed)).toEqual(field ? { ...empty, [field]: field === 'problem' ? answer : [answer] } : empty);
  });
});
