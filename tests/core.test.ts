import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SeedStore, loadConfig } from '../src/storage/store.js';
import { addConversation, plant, recordDecision } from '../src/core/seed-manager.js';
import { applyGrowth, askGrowthQuestion, changeGrowthQuestion, growthReady, isGrowthPauseRequest, isQuestionChangeRequest } from '../src/core/growth.js';
import { calculateMaturity } from '../src/core/maturity.js';
import { harvest } from '../src/core/harvest.js';
import { branchSuggestions, createBranch, pruneItem } from '../src/core/branch.js';
import { dimensionsFor } from '../src/ai/provider.js';
import { statusForMaturity } from '../src/core/maturity.js';
import { restoreItem, wake, wither } from '../src/core/lifecycle.js';
import { evaluateMaturity, waterInsight, waterPerspectives } from '../src/ai/provider.js';
import { gardenEntries } from '../src/core/garden.js';
import { webSources } from '../src/core/sunlight.js';

describe('Seed MVP flow', () => {
  it('extracts opt-in web sources and normalizes redirect URLs', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fstudy&amp;rut=ignored">Example <b>study</b></a>', { status: 200 })) as typeof fetch;
    try {
      await expect(webSources('study app')).resolves.toEqual([{
        source: 'https://example.com/study',
        title: 'Example study',
        snippet: 'Public search result; verify before treating as fact.',
      }]);
    } finally { globalThis.fetch = originalFetch; }
  });

  it('finds garden projects from a nested working directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-garden-nested-'));
    const nested = path.join(root, 'packages', 'app');
    try {
      await mkdir(nested, { recursive: true });
      const store = new SeedStore(root);
      const seed = await plant(store, 'A nested garden idea');
      const entries = await gardenEntries(nested);
      expect(entries.some((entry) => entry.path === root && entry.seed.id === seed.id)).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps garden discovery read-only outside a Seed project', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-garden-readonly-'));
    try {
      expect(await gardenEntries(root)).toEqual([]);
      await expect(import('node:fs/promises').then(({ stat }) => stat(path.join(root, '.seed')))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('finds a project from its valid seed backup when the current file is missing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-garden-backup-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A backed-up garden idea');
      await store.save({ ...seed, coreIdea: 'A newer backed-up idea' });
      await rm(path.join(store.base, 'seed.json'));
      const entries = await gardenEntries(root);
      expect(entries.some((entry) => entry.path === root && entry.seed.coreIdea === seed.coreIdea)).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('plants, grows, and preserves conversations/history', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-test-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, '  A repository guide for new developers  ');
      expect(seed.originalIdea).toBe('A repository guide for new developers');
      const question = await askGrowthQuestion(store, seed, 'local');
      const prompted = await store.load();
      expect(prompted.openQuestions.some((entry) => entry.question === question && entry.status === 'open')).toBe(true);
      expect(prompted.openQuestions.find((entry) => entry.question === question)?.importance).toBe('high');
      expect(await askGrowthQuestion(store, prompted, 'local')).toBe(question);
      expect((await store.conversations(seed.id)).filter((entry) => entry.type === 'question')).toHaveLength(1);
      const result = await applyGrowth(store, prompted, 'Help a developer find the right starting point.', 'local');
      expect(result.seed.coreIdea).toContain('Help a developer');
      expect(result.update.updatedSummary).toBe(result.seed.coreIdea);
      expect(result.update.contradictionsDetected).toEqual([]);
      expect(result.seed.maturity).toBeGreaterThan(0);
      expect((await store.conversations(seed.id)).length).toBe(3);
      expect((await store.load()).openQuestions.every((entry) => entry.status === 'answered')).toBe(true);
      const events = await store.events(seed.id);
      expect(events.map((event) => event.type)).toEqual(['plant', 'grow']);
      expect(events[1]?.metadata).toMatchObject({ before: 'A repository guide for new developers', after: result.after, question, answer: 'Help a developer find the right starting point.' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('does not overwrite a Seed when planting concurrently', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-plant-race-'));
    try {
      const store = new SeedStore(root);
      const results = await Promise.allSettled([
        plant(store, 'First idea'),
        plant(store, 'Second idea'),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected' && result.reason instanceof Error && result.reason.message === 'seed-exists')).toHaveLength(1);
      expect((await store.load()).originalIdea).toMatch(/^(First|Second) idea$/);
      expect((await store.events((await store.load()).id)).filter((event) => event.type === 'plant')).toHaveLength(1);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects an empty idea', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-empty-'));
    try { await expect(plant(new SeedStore(root), '   ')).rejects.toThrow('idea-required'); }
    finally { await rm(root, { recursive: true, force: true }); }
  });

  it('does not record an empty growth answer', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-empty-answer-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A small idea');
      await expect(applyGrowth(store, seed, '   ', 'local')).rejects.toThrow('answer-required');
      expect(await store.conversations(seed.id)).toHaveLength(0);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('validates persisted records and ignores malformed unrelated files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-storage-schema-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, 'A schema-safe idea');
      await writeFile(path.join(store.base, 'conversations', 'broken.json'), '{}');
      await writeFile(path.join(store.base, 'branches', 'broken.json'), '{}');
      await writeFile(path.join(store.base, 'history', 'events.jsonl'), '{"broken":true}\n');
      expect(await store.conversations(seed.id)).toEqual([]);
      expect(await store.branches(seed.id)).toEqual([]);
      expect(await store.events(seed.id)).toEqual([]);
      await expect(store.save({ ...seed, maturity: 101 })).rejects.toThrow();
      expect((await store.load()).maturity).toBe(seed.maturity);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('treats difficulty and rephrase requests as conversation control, not idea evidence', async () => {
    expect(isQuestionChangeRequest('너무 어려워 다른질문')).toBe(true);
    expect(isQuestionChangeRequest('어려워요, 다른 질문으로 해줘')).toBe(true);
    expect(isQuestionChangeRequest('난 잘 모르겠어 다른 질문으로 해줘')).toBe(true);
    expect(isQuestionChangeRequest('뭐라고 해야 할지 모르겠어요')).toBe(true);
    expect(isQuestionChangeRequest('너무 어려워 다른질문')).toBe(true);
    expect(isQuestionChangeRequest('다른 질문으로 바꿔줘')).toBe(true);
    expect(isQuestionChangeRequest('Could you ask me an easier question?')).toBe(true);
    expect(isQuestionChangeRequest('힌트 좀 보여줘')).toBe(true);
    expect(isQuestionChangeRequest('Give me an example')).toBe(true);
    expect(isQuestionChangeRequest("I don't understand")).toBe(true);
    expect(isQuestionChangeRequest('왜 이걸 물어봐?')).toBe(true);
    expect(isQuestionChangeRequest('무슨 말이야?')).toBe(true);
    expect(isQuestionChangeRequest('그건 아닌데')).toBe(true);
    expect(isQuestionChangeRequest('not that')).toBe(true);
    expect(isQuestionChangeRequest('답을 어떻게 해야 할지 모르겠어')).toBe(true);
    expect(isQuestionChangeRequest('I do not know how to answer')).toBe(true);
    expect(isQuestionChangeRequest('모르겟어')).toBe(true);
    expect(isQuestionChangeRequest('그냥 모르겠어요')).toBe(true);
    expect(isQuestionChangeRequest('I am not sure what you mean')).toBe(true);
    expect(isQuestionChangeRequest("I don't know how to answer")).toBe(true);
    expect(isQuestionChangeRequest('좀 더 쉽게 설명해줘')).toBe(true);
    expect(isQuestionChangeRequest('예시 하나')).toBe(true);
    expect(isQuestionChangeRequest('다음 질문으로 넘어가줘')).toBe(true);
    expect(isQuestionChangeRequest('Could you give me a hint?')).toBe(true);
    expect(isQuestionChangeRequest("I'm confused")).toBe(true);
    expect(isQuestionChangeRequest('뭘 답해야 할지 모르겠어')).toBe(true);
    expect(isQuestionChangeRequest('이건 아닌 것 같아')).toBe(true);
    expect(isQuestionChangeRequest('너무 어려운 질문이야, 이런 건 AI가 판단해줘')).toBe(true);
    expect(isQuestionChangeRequest('This question is too difficult for me')).toBe(true);
    expect(isQuestionChangeRequest('Too hard, ask another question')).toBe(true);
    expect(isQuestionChangeRequest("That's not what I mean")).toBe(true);
    expect(isQuestionChangeRequest('전 이 질문에 어떻게 답해야 할지 모르겠어요')).toBe(true);
    expect(isQuestionChangeRequest('아무것도 모르겠는데요')).toBe(true);
    expect(isQuestionChangeRequest('음...')).toBe(true);
    expect(isQuestionChangeRequest('말이 너무 어려워요')).toBe(true);
    expect(isQuestionChangeRequest('너무 헷갈려')).toBe(true);
    expect(isQuestionChangeRequest('나한테 너무 복잡해')).toBe(true);
    expect(isQuestionChangeRequest('이해가 안돼')).toBe(true);
    expect(isQuestionChangeRequest('이게 뭔 소리야')).toBe(true);
    expect(isQuestionChangeRequest('나는 이런 질문이 아직 어려워')).toBe(true);
    expect(isQuestionChangeRequest('어렵다')).toBe(true);
    expect(isQuestionChangeRequest('도와주세요')).toBe(true);
    expect(isQuestionChangeRequest('왜요?')).toBe(true);
    expect(isQuestionChangeRequest('I have no idea how to answer this')).toBe(true);
    expect(isQuestionChangeRequest('This is a lot')).toBe(true);
    expect(isQuestionChangeRequest('I cannot make sense of this')).toBe(true);
    expect(isQuestionChangeRequest('I am not following')).toBe(true);
    expect(isQuestionChangeRequest('What does this mean?')).toBe(true);
    // Short yes/no replies can be valid answers to a conversational question;
    // do not discard them as a request to change the question.
    expect(isQuestionChangeRequest('응')).toBe(false);
    expect(isQuestionChangeRequest('yes')).toBe(false);
    expect(isQuestionChangeRequest('The problem is difficult for students')).toBe(false);
    expect(isQuestionChangeRequest('학생들이 질문을 어려워한다')).toBe(false);
    expect(isQuestionChangeRequest('이 앱은 다른 질문을 제공한다')).toBe(false);
    expect(isQuestionChangeRequest('다른 질문을 통해 공부한다')).toBe(false);
    expect(isQuestionChangeRequest('AI가 어려운 질문을 판단하는 앱')).toBe(false);
    expect(isQuestionChangeRequest('AI가 사용자 대신 판단하는 기능')).toBe(false);
    expect(isQuestionChangeRequest('나는 앱을 만들고 싶은데 이 질문은 너무 어려워서 네가 정해줘')).toBe(true);
    expect(isQuestionChangeRequest('I want to build an app, but this question is too hard, so you decide')).toBe(true);
    expect(isQuestionChangeRequest('무슨 뜻인지 알아요')).toBe(false);
    expect(isQuestionChangeRequest('그냥')).toBe(true);
    expect(isQuestionChangeRequest('글쎄요')).toBe(true);
    expect(isQuestionChangeRequest('모르겠음')).toBe(true);
    expect(isQuestionChangeRequest('어려움')).toBe(true);
    expect(isQuestionChangeRequest('Whatever')).toBe(true);
    expect(isQuestionChangeRequest('Up to you')).toBe(true);
    expect(isQuestionChangeRequest('No clue')).toBe(true);
    expect(isQuestionChangeRequest('I dunno')).toBe(true);
    expect(isQuestionChangeRequest('그냥 공부앱을 만들고 싶어')).toBe(false);
    expect(isQuestionChangeRequest('그냥 네가 알아서 정해줘')).toBe(true);
    expect(isQuestionChangeRequest('네가 골라')).toBe(true);
    expect(isQuestionChangeRequest('너한테 맡길게')).toBe(true);
    expect(isQuestionChangeRequest('You decide')).toBe(true);
    expect(isQuestionChangeRequest('Just pick one for me')).toBe(true);
    expect(isQuestionChangeRequest('I will leave it to you')).toBe(true);
    expect(isQuestionChangeRequest('네가 골라주는 앱')).toBe(false);
    expect(isGrowthPauseRequest('잠깐 생각해볼게')).toBe(true);
    expect(isGrowthPauseRequest("I'll answer later")).toBe(true);
    expect(isGrowthPauseRequest('다음에 생각해볼게요')).toBe(true);
    expect(isGrowthPauseRequest('I will answer later')).toBe(true);
    expect(isGrowthPauseRequest('여기까지')).toBe(true);
    expect(isGrowthPauseRequest('stop')).toBe(true);
    expect(isGrowthPauseRequest('잠깐만')).toBe(true);
    expect(isGrowthPauseRequest('잠깐만요')).toBe(true);
    expect(isGrowthPauseRequest('조금만 생각할게')).toBe(true);
    expect(isGrowthPauseRequest('잠시 후에 답할게')).toBe(true);
    expect(isGrowthPauseRequest('give me a second')).toBe(true);
    expect(isGrowthPauseRequest('일단 나중에 답할게')).toBe(true);
    expect(isGrowthPauseRequest('지금은 말고 나중에')).toBe(true);
    expect(isGrowthPauseRequest("I'll think about it")).toBe(true);
    expect(isGrowthPauseRequest('학생들은 나중에 답을 찾는다')).toBe(false);
    expect(isGrowthPauseRequest('사용자는 다음에 생각을 정리한다')).toBe(false);
    expect(isGrowthPauseRequest("I'll get back to this later")).toBe(true);
    expect(isGrowthPauseRequest('학생들이 여기까지 공부해요')).toBe(false);
    expect(isQuestionChangeRequest('잠깐, 이 질문이 너무 어려워요')).toBe(true);
    expect(isGrowthPauseRequest('잠깐, 이 질문이 너무 어려워요')).toBe(false);
    expect(isQuestionChangeRequest('잠깐, 다른 질문')).toBe(true);
    expect(isQuestionChangeRequest('um, ask another question')).toBe(true);
    expect(isQuestionChangeRequest('음, 예시 보여줘')).toBe(true);
    expect(isQuestionChangeRequest('답변하기 어렵네요')).toBe(true);
    expect(isQuestionChangeRequest('음, 학생들에게 예시를 보여주는 기능')).toBe(false);
    expect(isQuestionChangeRequest('Um, students need an easier question')).toBe(false);
    expect(isGrowthPauseRequest('잠깐만, 나중에 답할게')).toBe(true);
    expect(isGrowthPauseRequest('later, I will answer')).toBe(true);

    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-question-change-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A study app');
      const first = await askGrowthQuestion(store, seed, 'local', undefined, undefined, 'ko');
      const changed = await changeGrowthQuestion(store, await store.load(), 'local', undefined, undefined, 'ko', '너무 어려워 다른질문');
      expect(changed).not.toBe(first);
      const saved = await store.load();
      expect(saved.maturity).toBe(seed.maturity);
      expect(saved.openQuestions.find((question) => question.question === first)?.status).toBe('cancelled');
      expect(saved.openQuestions.find((question) => question.question === changed)?.status).toBe('open');
      expect(saved.coreIdea).toBe(seed.coreIdea);
      const controls = (await store.conversations(seed.id)).filter((entry) => entry.metadata?.intent === 'change-question');
      expect(controls).toHaveLength(1);
      await harvest(store, saved, 'prd', 'ko');
      expect((await store.harvestResults(seed.id))[0]?.content).not.toContain('너무 어려워 다른질문');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('replaces a stale difficult pending question when resuming', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-stale-question-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, '공부앱');
      const stale = {
        ...seed,
        users: ['학생'],
        problem: '단어를 외우기 어려움',
        goals: ['단어를 기억하기'],
        constraints: ['암기만'],
        openQuestions: [{
          id: 'stale-question', seedId: seed.id, question: '좋아요. 첫 검증에서 가장 위험한 가정은 무엇일까요?', focus: 'validation' as const,
          importance: 'medium' as const, status: 'open' as const, createdAt: seed.createdAt,
        }],
      };
      await store.save(stale);
      const question = await askGrowthQuestion(store, stale, 'local', undefined, undefined, 'ko');
      const saved = await store.load();
      expect(question).not.toMatch(/검증|가정|만들기 전에/);
      expect(saved.openQuestions.find((entry) => entry.id === 'stale-question')?.status).toBe('cancelled');
      expect(saved.openQuestions.find((entry) => entry.status === 'open')?.question).toBe(question);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('records only explicit user decisions and applies the decision bonus', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-decision-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A small idea');
      const mature = { ...seed, maturity: 80, status: 'blooming' as const, maturityDimensions: seed.maturityDimensions.map((dimension) => ({ ...dimension, score: 80 })) };
      await store.save(mature);
      const result = await recordDecision(store, mature, 'Keep one workflow in v1', 'The core loop should be validated first');
      expect(result.decision.confirmedByUser).toBe(true);
      expect(result.decision.source).toBe('user');
      expect(result.seed.decisions).toHaveLength(1);
      expect(await store.decisions(seed.id)).toHaveLength(1);
      expect(result.seed.maturity).toBe(82);
      expect((await store.events(seed.id)).some((event) => event.type === 'decision')).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps branch decisions out of the parent maturity while preserving branch context', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-branch-decision-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A branching idea');
      const branch = await createBranch(store, seed, 'Focused path', 'A focused path');
      const before = await store.load();
      const result = await recordDecision(store, before, 'Keep the focused path', 'Validate the smallest loop first', branch.id);
      const parent = await store.load(); const savedBranch = (await store.branches(seed.id)).find((item) => item.id === branch.id)!;
      expect(result.seed.decisions).toHaveLength(0);
      expect(parent.decisions).toHaveLength(0);
      expect(parent.maturity).toBe(before.maturity);
      expect(savedBranch.decisions.map((item) => item.decision)).toEqual(['Keep the focused path']);
      expect((await store.decisions(seed.id)).map((item) => item.decision)).toEqual(['Keep the focused path']);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('preserves concurrent user decisions on the same Seed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-decision-race-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A decision race idea');
      const results = await Promise.all([
        recordDecision(store, seed, 'Keep the first step small', 'It is easier to try'),
        recordDecision(store, seed, 'Ask one question at a time', 'It is easier to answer'),
      ]);
      expect(results).toHaveLength(2);
      expect((await store.load()).decisions.map((decision) => decision.decision)).toEqual(expect.arrayContaining(['Keep the first step small', 'Ask one question at a time']));
      expect(await store.decisions(seed.id)).toHaveLength(2);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('does not leak branch conversation language into the root question', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-branch-context-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A study app');
      const branch = await createBranch(store, seed, 'Korean path', 'Explore a Korean direction');
      await addConversation(store, { seedId: seed.id, branchId: branch.id, role: 'user', type: 'answer', content: '학생이 먼저 써요.' });
      const question = await askGrowthQuestion(store, await store.load(), 'local', undefined, undefined, 'en');
      expect(question).toContain('Who');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps the guided conversation focused and reaches a ready seed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-growth-ready-'));
    try {
      const store = new SeedStore(root);
      let seed = await plant(store, 'A study planning app');
      const answers = ['High-school students', 'They do not know what to study first', 'A clear plan they can finish today', 'Only planning and completion for v1', 'Students will return if the plan saves them time'];
      for (const answer of answers) {
        await askGrowthQuestion(store, seed, 'local', undefined, undefined, 'en');
        seed = await store.load();
        seed = (await applyGrowth(store, seed, answer, 'local', undefined, 'en')).seed;
      }
      expect(seed.users).toEqual(['High-school students']);
      expect(seed.problem).toBe('They do not know what to study first');
      expect(seed.goals).toEqual(['A clear plan they can finish today']);
      expect(seed.constraints).toEqual(['Only planning and completion for v1']);
      expect(seed.assumptions).toEqual(['Students will return if the plan saves them time']);
      expect(seed.openQuestions.filter((question) => question.status === 'answered')).toHaveLength(5);
      expect(growthReady(seed)).toBe(true);
      expect(seed.maturity).toBeGreaterThanOrEqual(58);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps maturity evidence when the next turn focuses another dimension', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-maturity-evidence-'));
    try {
      const store = new SeedStore(root); let seed = await plant(store, 'A study planner');
      for (const answer of ['Students', 'They cannot choose what to study', 'A plan for today', 'Planning only']) {
        await askGrowthQuestion(store, seed, 'local'); seed = await store.load(); seed = (await applyGrowth(store, seed, answer, 'local')).seed;
      }
      const before = seed.maturity; const bloom = dimensionsFor(seed); const recalculated = calculateMaturity({ ...seed, maturityDimensions: bloom, maturity: 0 });
      expect(recalculated).toBeGreaterThanOrEqual(before - 1);
      expect(bloom.find((dimension) => dimension.name === 'user')!.score).toBeGreaterThan(70);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('advances the maturity signal for every accepted growth turn', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-growth-progress-'));
    try {
      const store = new SeedStore(root);
      let seed = await plant(store, 'A focused idea');
      let previous = seed.maturity;
      for (const answer of ['Students', 'They cannot focus', 'Finish one session']) {
        await askGrowthQuestion(store, seed, 'local');
        seed = (await applyGrowth(store, await store.load(), answer, 'local')).seed;
        expect(seed.maturity).toBeGreaterThan(previous);
        previous = seed.maturity;
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rotates validation prompts instead of repeating the same question', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-validation-prompts-'));
    try {
      const store = new SeedStore(root);
      let seed = await plant(store, 'A study planner');
      for (const answer of ['Students', 'They lose focus', 'Finish a session', 'Timer only', 'Students return']) {
        await askGrowthQuestion(store, seed, 'local');
        seed = (await applyGrowth(store, await store.load(), answer, 'local')).seed;
      }
      const first = await askGrowthQuestion(store, seed, 'local');
      seed = (await applyGrowth(store, await store.load(), 'Learn whether they finish', 'local')).seed;
      const second = await askGrowthQuestion(store, seed, 'local');
      seed = (await applyGrowth(store, await store.load(), 'Observe where they stop', 'local')).seed;
      const third = await askGrowthQuestion(store, seed, 'local');
      expect(second).not.toBe(first);
      expect(third).not.toBe(second);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('classifies legacy questions without focus metadata by the next required field', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-legacy-question-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, 'A small idea');
      const question = 'Who should this help first?';
      await addConversation(store, { seedId: seed.id, role: 'assistant', type: 'question', content: question });
      await store.save({ ...seed, openQuestions: [{ id: 'legacy-q', seedId: seed.id, question, importance: 'high', status: 'open', createdAt: seed.createdAt }] });
      const result = await applyGrowth(store, await store.load(), 'Students', 'local');
      expect(result.seed.users).toEqual(['Students']);
      expect(result.seed.goals).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('calculates maturity with open-question penalty and decision bonus', () => {
    const dimensions = Array.from({ length: 8 }, (_, index) => ({ name: String(index), score: 80, reason: '' }));
    const seed = {
      version: 1, id: 'seed', name: 'seed', status: 'growing' as const, maturity: 80,
      maturityDimensions: dimensions, originalIdea: 'x', coreIdea: 'x', problem: '', users: [], goals: [], constraints: [], branches: [], prunedItems: [], assumptions: [],
      decisions: [{ id: 'd', seedId: 'seed', decision: 'x', reason: 'x', source: 'x', confirmedByUser: true, createdAt: '' }],
      openQuestions: [{ id: 'q', seedId: 'seed', question: 'x', importance: 'high' as const, status: 'open' as const, createdAt: '' }], createdAt: '', updatedAt: '',
    };
    expect(calculateMaturity(seed)).toBe(77);
  });

  it('does not inflate a fresh seed during a Bloom check', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-fresh-bloom-'));
    try {
      const seed = await plant(new SeedStore(root), 'A vague idea');
      const dimensions = dimensionsFor(seed);
      expect(calculateMaturity({ ...seed, maturity: 0, maturityDimensions: dimensions })).toBeLessThanOrEqual(10);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('versions harvested markdown without overwriting', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-harvest-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A small idea');
      const one = await harvest(store, seed, 'idea', 'en'); const two = await harvest(store, seed, 'idea', 'en');
      expect(one).toMatch(/idea-v1\.md$/); expect(two).toMatch(/idea-v2\.md$/);
      expect((await store.load()).status).toBe('harvested');
      const results = await store.harvestResults(seed.id); expect(results).toHaveLength(2); expect(results[0]?.maturitySnapshot).toBe(5); expect(results[1]?.content).toContain('A small idea');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps concurrent harvest languages isolated', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-harvest-language-race-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A language-safe idea');
      const [koreanFile, englishFile] = await Promise.all([
        harvest(store, seed, 'prd', 'ko'),
        harvest(store, seed, 'trd', 'en'),
      ]);
      const { readFile } = await import('node:fs/promises');
      expect(await readFile(koreanFile as string, 'utf8')).toContain('제품 요구사항 문서');
      expect(await readFile(englishFile as string, 'utf8')).toContain('Technical Requirements Document');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps harvest versions append-only when an older file is removed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-harvest-gap-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A versioned idea');
      const first = await harvest(store, seed, 'idea', 'en');
      await harvest(store, seed, 'idea', 'en');
      await rm(first);
      const third = await harvest(store, seed, 'idea', 'en');
      expect(third).toMatch(/idea-v3\.md$/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('serializes concurrent harvests of the same document type', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-harvest-race-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A concurrent harvest idea');
      const files = await Promise.all([
        harvest(store, seed, 'idea', 'en'),
        harvest(store, seed, 'idea', 'en'),
      ]);
      expect(new Set(files)).toHaveLength(2);
      expect(files.map((file) => String(file).match(/idea-v[12]\.md$/)?.[0])).toEqual(expect.arrayContaining(['idea-v1.md', 'idea-v2.md']));
      expect(await store.harvestResults(seed.id)).toHaveLength(2);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('harvests all document types with the required PRD/TRD sections', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-all-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A small idea');
      const files = await harvest(store, seed, 'all', 'en');
      expect(files).toHaveLength(6);
      expect(await store.harvestResults(seed.id)).toHaveLength(6);
      const { readFile } = await import('node:fs/promises');
      const prd = await readFile(files.find((file) => file.endsWith('prd-v1.md'))!, 'utf8');
      const trd = await readFile(files.find((file) => file.endsWith('trd-v1.md'))!, 'utf8');
      const readme = await readFile(files.find((file) => file.endsWith('readme-v1.md'))!, 'utf8');
      for (const section of ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.', '## 8.', '## 9.', '## 10.', '## 11.', '## 12.', '## 13.']) expect(prd).toContain(section);
      for (const section of ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.', '## 8.', '## 9.', '## 10.', '## 11.', '## 12.', '## 13.', '## 14.', '## 15.', '## 16.', '## 17.', '## 18.', '## 19.', '## 20.', '## 21.']) expect(trd).toContain(section);
      expect(prd).toContain('**Maturity:**');
      expect(prd).toContain('### Conversation evidence');
      expect(readme).toContain('## Description');
      expect(readme).toContain('## Architecture');
      expect(readme).toContain('MIT');
      expect(readme).not.toContain('placeholder');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('localizes harvested PRD/TRD static guidance to Korean', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-harvest-ko-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, '공부 앱 아이디어');
      const prdFile = await harvest(store, seed, 'prd', 'ko');
      const trdFile = await harvest(store, await store.load(), 'trd', 'ko');
      const { readFile } = await import('node:fs/promises');
      const prd = await readFile(prdFile as string, 'utf8');
      const trd = await readFile(trdFile as string, 'utf8');
      expect(prd).toContain('제품 요구사항 문서');
      expect(prd).toContain('사용자가 구체적인 상황을 설명합니다.');
      expect(prd).toContain('기록된 브랜치가 없습니다.');
      expect(prd).toContain('확정된 결정');
      expect(trd).toContain('기술 요구사항 문서');
      expect(trd).toContain('AI / LLM 아키텍처');
      expect(trd).toContain('미정');
      expect(trd).not.toContain('TBD —');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('does not invent a technology stack for a TRD without evidence', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-trd-empty-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A gentle way to remember birthdays');
      const { readFile } = await import('node:fs/promises');
      const trd = await readFile(await harvest(store, seed, 'trd', 'en') as string, 'utf8');
      for (const invented of ['Node.js', 'TypeScript', 'Commander', 'Zod', 'src/cli', 'OpenAI']) expect(trd).not.toContain(invented);
      expect(trd).toContain('## 3. Technology Stack\n- TBD');
      expect(trd).toContain('## 10. Storage\n- TBD');
      expect(trd).toContain('A gentle way to remember birthdays');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('derives TRD technology choices from constraints, decisions, and answers with citations', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-trd-evidence-'));
    try {
      const store = new SeedStore(root); const planted = await plant(store, 'Shared grocery list for roommates');
      await store.save({ ...planted, constraints: ['Must work offline on mobile'], goals: ['Roommates see purchases in real-time'] });
      await addConversation(store, { seedId: planted.id, role: 'user', type: 'answer', content: 'We want a React Native app with Supabase for sync' });
      await recordDecision(store, await store.load(), 'Ship to the App Store first', 'iOS users dominate our group');
      const { readFile } = await import('node:fs/promises');
      const trd = await readFile(await harvest(store, await store.load(), 'trd', 'en') as string, 'utf8');
      expect(trd).toContain('- Mobile — constraint: "Must work offline on mobile"');
      expect(trd).toContain('- React Native — user answer: "We want a React Native app with Supabase for sync"');
      expect(trd).not.toMatch(/- React —/);
      expect(trd).toContain('- Supabase — user answer:');
      expect(trd).toContain('- Offline — constraint:');
      expect(trd).toContain('- Real-time (not confirmed yet) — goal:');
      expect(trd).toContain('- App Store — confirmed decision: "Ship to the App Store first');
      expect(trd).toContain('- iOS — confirmed decision:');
      expect(trd).toContain('Acceptance test: the target user can achieve "Roommates see purchases in real-time"');
      expect(trd).not.toContain('Node.js');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('includes accumulated research and branch decisions in the PRD harvest', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-harvest-context-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A focused workflow');
      const branch = await createBranch(store, seed, 'Repository tour', 'Help a new developer orient quickly');
      await store.saveResearch({ id: 'research-1', seedId: seed.id, source: 'https://example.com', title: 'User interview', summary: 'Developers need a faster first step.', relevance: 'high', retrievedAt: new Date().toISOString(), isVerified: true, isEstimate: false });
      await recordDecision(store, await store.load(), 'Use a CLI-first workflow', 'Validate the smallest loop before adding surfaces');
      const file = await harvest(store, { ...(await store.load()), goals: ['Reach the first useful result'], constraints: ['One workflow only'], users: ['New developers'] }, 'prd', 'en');
      const { readFile } = await import('node:fs/promises'); const document = await readFile(file as string, 'utf8');
      expect(document).toContain('Repository tour: Help a new developer orient quickly');
      expect(document).toContain('User interview: Developers need a faster first step. [verified]');
      expect(document).toContain('Use a CLI-first workflow — Validate the smallest loop before adding surfaces');
      expect(document).toContain('One workflow only');
      expect(branch.id).toBeTruthy();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps branches independent and enforces the active branch limit', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-branch-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'Explore a developer workflow');
      const suggestions = await branchSuggestions(seed, 'local'); expect(suggestions.length).toBeGreaterThanOrEqual(2); expect(suggestions.length).toBeLessThanOrEqual(4);
      let current = await createBranch(store, seed, suggestions[0]!.name, suggestions[0]!.summary);
      let latest = await store.load();
      for (let index = 1; index < 5; index += 1) { const suggestion = suggestions[index % suggestions.length]!; await createBranch(store, latest, `${suggestion.name}-${index}`, suggestion.summary); latest = await store.load(); }
      await expect(createBranch(store, latest, 'Overflow', 'Too broad')).rejects.toThrow('too-many-branches');
      expect((await store.branches(seed.id)).filter((branch) => branch.status === 'active')).toHaveLength(5);
      await expect(createBranch(store, seed, 'Stale overflow', 'Should still see five active branches')).rejects.toThrow('too-many-branches');
      const pruned = await pruneItem(store, latest, current.id); expect(pruned.activeBranch).not.toBe(current.id); expect((await store.branches(seed.id)).find((branch) => branch.id === current.id)?.status).toBe('pruned'); expect(pruned.coreIdea).toContain('For the first version, we can leave');
      const repeated = await pruneItem(store, await store.load(), current.id); expect(repeated.maturity).toBe(pruned.maturity);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('enforces the active branch limit during concurrent creation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-branch-race-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A branch race idea');
      let current = seed;
      for (let index = 0; index < 4; index += 1) {
        await createBranch(store, current, `Existing ${index}`, `Existing direction ${index}`);
        current = await store.load();
      }
      const results = await Promise.allSettled([
        createBranch(store, current, 'Concurrent A', 'First concurrent direction'),
        createBranch(store, current, 'Concurrent B', 'Second concurrent direction'),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected' && result.reason instanceof Error && result.reason.message === 'too-many-branches')).toHaveLength(1);
      expect((await store.branches(seed.id)).filter((branch) => branch.status === 'active')).toHaveLength(5);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects empty branch and prune targets before changing state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-input-required-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A small idea');
      await expect(createBranch(store, seed, '  ', 'A summary')).rejects.toThrow('branch-name-required');
      await expect(createBranch(store, seed, 'A path', '  ')).rejects.toThrow('branch-summary-required');
      await expect(pruneItem(store, seed, '   ')).rejects.toThrow('prune-item-required');
      expect((await store.load()).coreIdea).toBe(seed.coreIdea);
      expect(await store.branches(seed.id)).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('returns to the root conversation when its only active branch is pruned', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-prune-only-active-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A focused idea');
      const branch = await createBranch(store, seed, 'Optional path', 'An optional path');
      const pruned = await pruneItem(store, await store.load(), branch.id, 'en');
      expect(pruned.activeBranch).toBeUndefined();
      await expect(askGrowthQuestion(store, pruned, 'local')).resolves.toBeTruthy();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects growth against a branch that does not exist', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-missing-branch-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A small idea');
      await expect(askGrowthQuestion(store, seed, 'local', 'missing-branch')).rejects.toThrow('branch-selection-not-found');
      await expect(applyGrowth(store, seed, 'An answer', 'local', 'missing-branch')).rejects.toThrow('branch-selection-not-found');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('does not grow a pruned branch until it is restored', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-inactive-branch-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A small idea');
      const branch = await createBranch(store, seed, 'Optional path', 'An optional path');
      const pruned = await pruneItem(store, await store.load(), branch.id, 'en');
      await expect(askGrowthQuestion(store, pruned, 'local', branch.id)).rejects.toThrow('branch-not-active');
      await expect(applyGrowth(store, pruned, 'An answer', 'local', branch.id)).rejects.toThrow('branch-not-active');
      await expect(recordDecision(store, pruned, 'Keep the branch', 'Not yet', branch.id)).rejects.toThrow('branch-not-active');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps branch growth on the branch instead of rewriting the parent seed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-branch-grow-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, 'A repository guide');
      const branch = await createBranch(store, seed, 'Onboarding tour', 'A guided onboarding tour');
      const question = await askGrowthQuestion(store, await store.load(), 'local', branch.id);
      const result = await applyGrowth(store, await store.load(), 'Show the first useful path through the repository', 'local', branch.id);
      const parent = await store.load();
      const savedBranch = (await store.branches(seed.id)).find((item) => item.id === branch.id)!;
      expect(question).toBeTruthy();
      expect(savedBranch.openQuestions).toHaveLength(1);
      expect(result.seed.coreIdea).toBe(seed.coreIdea);
      expect(parent.coreIdea).toBe(seed.coreIdea);
      expect(savedBranch.summary).toContain('Show the first useful path');
      expect(savedBranch.summary.match(/Show the first useful path through the repository/g)?.length).toBe(1);
      expect(savedBranch.openQuestions[0]?.status).toBe('answered');
      expect(savedBranch.maturity).toBeGreaterThan(branch.maturity);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('continues branch conversations without restarting the parent questionnaire', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-branch-conversation-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, '공부 플래너');
      const branch = await createBranch(store, seed, 'Daily ritual', 'A daily study ritual');
      const firstQuestion = await askGrowthQuestion(store, await store.load(), 'local', branch.id, undefined, 'ko');
      const first = await applyGrowth(store, await store.load(), '첫 주에 매일 20분 실행', 'local', branch.id, 'ko');
      const secondQuestion = await askGrowthQuestion(store, first.seed, 'local', branch.id, undefined, 'ko');
      expect(firstQuestion).toContain('Daily ritual');
      expect(secondQuestion).not.toBe(firstQuestion);
      expect(secondQuestion).not.toContain('누가');
      expect(secondQuestion).toContain('도움이 됐다는 걸');
      expect((await store.branches(seed.id)).find((item) => item.id === branch.id)?.openQuestions.filter((question) => question.status === 'answered')).toHaveLength(1);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('evaluates all maturity dimensions and maps the bloom state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-bloom-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A focused project');
      const updated = { ...seed, problem: 'A concrete problem', users: ['developers'], goals: ['a useful outcome'], maturityDimensions: dimensionsFor({ ...seed, problem: 'A concrete problem', users: ['developers'], goals: ['a useful outcome'] }) };
      expect(updated.maturityDimensions).toHaveLength(8); expect(statusForMaturity(85)).toBe('mature');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('preserves lifecycle state and restores pruned branches', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-lifecycle-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A focused workflow');
      const dormant = await wither(store, seed); expect(dormant.status).toBe('dormant'); expect(dormant.preDormantStatus).toBe('seedling');
      const awake = await wake(store, dormant); expect(awake.status).toBe('seedling'); expect(awake.preDormantStatus).toBeUndefined();
      const branch = await createBranch(store, awake, 'A branch', 'A branch summary');
      const pruned = await pruneItem(store, await store.load(), branch.name.toLowerCase()); expect((await store.branches(seed.id)).find((item) => item.id === branch.id)?.status).toBe('pruned');
      const restored = await restoreItem(store, pruned, branch.name.toUpperCase()); expect((await store.branches(seed.id)).find((item) => item.id === branch.id)?.status).toBe('active');
      expect(restored.prunedItems).not.toContain(branch.name.toLowerCase());
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('reads the latest state before changing lifecycle status', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-lifecycle-latest-'));
    try {
      const store = new SeedStore(root);
      const stale = await plant(store, 'A lifecycle idea');
      await store.save({ ...stale, coreIdea: 'Updated while another session was open', maturity: 42, status: 'growing' });
      const dormant = await wither(store, stale);
      expect(dormant.coreIdea).toBe('Updated while another session was open');
      expect(dormant.maturity).toBe(42);
      const awake = await wake(store, stale);
      expect(awake.status).toBe('growing');
      expect(awake.coreIdea).toBe('Updated while another session was open');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('treats repeated and case-variant prune/restore inputs as the same item', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-prune-case-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A focused workflow');
      const first = await pruneItem(store, seed, 'Team collaboration', 'en');
      const repeated = await pruneItem(store, first, 'team COLLABORATION', 'en');
      expect(repeated.maturity).toBe(first.maturity);
      expect(repeated.coreIdea).toBe(first.coreIdea);
      expect(repeated.prunedItems).toEqual(['Team collaboration']);
      const restored = await restoreItem(store, repeated, 'TEAM COLLABORATION');
      expect(restored.prunedItems).toEqual([]);
      expect(restored.constraints).toEqual([]);
      expect(restored.coreIdea).toBe(seed.coreIdea);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('matches branch IDs without depending on letter case', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-branch-id-case-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A branch id idea');
      const branch = await createBranch(store, seed, 'Optional path', 'An optional path');
      await pruneItem(store, await store.load(), branch.id.toUpperCase());
      expect((await store.branches(seed.id)).find((item) => item.id === branch.id)?.status).toBe('pruned');
      await restoreItem(store, await store.load(), branch.id.toUpperCase());
      expect((await store.branches(seed.id)).find((item) => item.id === branch.id)?.status).toBe('active');
      const question = await askGrowthQuestion(store, await store.load(), 'local', branch.id.toUpperCase());
      expect(question).toBeTruthy();
      const decision = await recordDecision(store, await store.load(), 'Keep this direction', 'It is focused', branch.id.toUpperCase());
      expect(decision.decision.branchId).toBe(branch.id);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('does not roll a harvested seed back when restoring a branch', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-restore-harvested-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, 'A harvested idea');
      const branch = await createBranch(store, seed, 'Optional path', 'An optional path');
      await pruneItem(store, await store.load(), branch.id);
      await harvest(store, await store.load(), 'idea', 'en');
      const restored = await restoreItem(store, await store.load(), branch.id);
      expect(restored.status).toBe('harvested');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('does not grow or bloom a dormant seed until it is woken', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-dormant-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A dormant idea'); const dormant = await wither(store, seed);
      await expect(applyGrowth(store, dormant, 'An answer', 'local')).rejects.toThrow('seed-dormant');
      await expect(createBranch(store, dormant, 'Blocked path', 'Should not mutate dormancy')).rejects.toThrow('seed-dormant');
      await expect(recordDecision(store, dormant, 'Blocked decision')).rejects.toThrow('seed-dormant');
      const evaluation = await evaluateMaturity(dormant, 'local'); const stillDormant = { ...dormant, maturityDimensions: evaluation.dimensions, maturity: calculateMaturity({ ...dormant, maturityDimensions: evaluation.dimensions }), status: 'dormant' as const };
      await store.save(stillDormant); expect((await store.load()).status).toBe('dormant');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('provides four water lenses and stores a usable local insight contract', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-water-'));
    try {
      const seed = await plant(new SeedStore(root), 'A small idea');
      const perspectives = await waterPerspectives(seed, 'local', undefined, 'en');
      expect(perspectives).toHaveLength(4);
      expect(perspectives.map((item) => item.question).join(' ')).not.toMatch(/technology|technical|scope|validation/i);
      const insight = await waterInsight(seed, perspectives[0]!, 'local', undefined, 'en');
      expect(insight.points.length).toBeGreaterThan(0); expect(insight.assumptions.length).toBeGreaterThan(0);
      const followUp = await waterInsight(seed, perspectives[0]!, 'local', undefined, 'en', 'A daily planning ritual');
      expect(followUp.summary).toContain('A daily planning ritual');
      expect(followUp.points[0]).toBe('A daily planning ritual');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('loads project configuration from a nested working directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-nested-config-')); const nested = path.join(root, 'packages', 'app');
    const previousCwd = process.cwd();
    try {
      await mkdir(nested, { recursive: true });
      const store = new SeedStore(root); const seed = await plant(store, 'A nested project');
      await (await import('node:fs/promises')).writeFile(path.join(root, '.seed', 'config.json'), JSON.stringify({ lang: 'ko' }));
      process.chdir(nested);
      expect((await loadConfig()).lang).toBe('ko');
      expect(seed.id).toBeTruthy();
    } finally { process.chdir(previousCwd); await rm(root, { recursive: true, force: true }); }
  });
});
