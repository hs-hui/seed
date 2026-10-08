import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { detectGrowthInputIntent } from '../src/ai/input-intent.js';
import { classifyGrowthInput } from '../src/ai/provider.js';
import { isGrowthPauseRequest, isQuestionChangeRequest } from '../src/core/growth.js';

// Ordinary answers from issue #6 that used to be discarded as controls.
const issueAnswers = [
  '나중에 답장하려고 미뤄두다가 잊어버려요',
  '나중에 다시 보려고 저장한 링크를 못 찾아요',
  '답장을 언제 해야 할지 몰라서 자꾸 미뤄요',
  '예를 들어 학생들이 과제 마감을 자주 놓쳐요',
  '쉽게 공유할 수 있으면 좋겠어요',
  '생각나는 대로 메모할 곳이 없어서 불편해요',
  '아이디어를 정리할 곳이 없어요',
  '이게 없으면 일정 관리가 어려워요',
  '그냥 친구들한테 먼저 보여줄래요',
  'Later in the evening, after they get home from work',
  'Example: a nurse who forgets to log her shift hours',
  'Explain tax rules to freelancers in plain words',
  'Hold on to receipts automatically so nothing gets lost',
  'Not sure yet, but probably busy parents',
];

// Answers that open with a word a control phrase also uses.
const controlLikeAnswers = [
  '나중에 쓰려고 적어둔 메모를 자꾸 잃어버려요',
  '예를 들어 회의 끝나고 할 일을 바로 정리하고 싶어요',
  '쉽게 따라 할 수 있는 운동 루틴이 필요해요',
  '생각보다 매일 기록하는 게 귀찮아요',
  '답장을 늦게 해서 친구들한테 미안할 때가 많아요',
  '이게 있으면 아침 준비 시간이 줄어들 거예요',
  '이런 앱이 있으면 동아리 회비 정리가 편할 것 같아요',
  '잠깐 쉬는 시간에 영어 단어를 외우고 싶어요',
  '다른 사람과 일정을 맞추기가 어려워요',
  '모르는 단어를 바로 찾아볼 수 있으면 좋겠어요',
  '힌트를 주면서 아이가 스스로 풀게 하고 싶어요',
  '왜 이 약을 먹어야 하는지 어르신들이 자주 잊어요',
  '다음 주 일정을 미리 알려주는 기능이요',
  '패스워드를 자꾸 잊어버리는 부모님',
  '그만두고 싶을 때 동기부여를 해주는 기능',
  '여기까지 온 사람들에게 보상을 주고 싶어요',
  '생각해볼 만한 질문을 매일 하나씩 보내주는 앱',
  '이해가 안 되는 계약서 문장을 쉽게 풀어주는 서비스',
  '학생들은 퀴즈를 좋아하는데 질문이 어려워요',
  // Short, but they can describe today's tools or the users themselves.
  '너무 복잡해요',
  '용어가 너무 어려워요',
  '다른 거 없어요',
  'Later that night, when the kids are asleep',
  'Hold on to warranty cards so nobody loses them',
  'Example: a teacher who grades essays on the bus',
  'Explain medical bills to elderly patients',
  'Give new users a simpler onboarding',
  'Ask another parent for a ride',
  'Let the AI help users plan meals',
  'I need help remembering birthdays',
  "I'm not sure yet, probably busy parents",
  'The confusing part is the tax forms',
  'Simplify that process for nurses',
  'Skip the paperwork and book appointments in one tap',
  'Stop reminders once the bill is paid',
  'Too hard to track shared expenses with roommates',
  'Why people quit gym memberships after a month',
  'Whatever the user cooked last week should show up first',
  'Not now, but in a later version we could add teams',
  'Teachers love the idea, but you decide',
  'Too complicated',
];

const explicitQuestionChanges = [
  '패스', '스킵', '건너뛸게요', '다른 질문 해줘', '쉬운 질문으로 바꿔줘', '모르겠어요', '잘 모르겠어', '너무 어려워요', '이거 어려워요',
  '무슨 말이야?', '왜 물어봐?', '힌트 좀 줘', '예시 보여줘', '이해가 안 돼요', '네가 알아서 정해줘', '어려워요, 다른 질문으로 해줘', '잠깐, 이 질문이 너무 어려워요',
  'skip', 'Pass', 'next question', 'Can we skip this question?', 'Ask me an easier question', 'Another question, please', "I don't know", "I don't understand",
  'What do you mean?', 'Why do you ask?', 'Too hard', 'This is confusing', 'Give me an example', 'Um, ask another question', 'This is hard, let the AI decide',
  // A lead-in is accepted only before a complaint that names this question.
  '나는 앱을 만들고 싶은데 이 질문은 너무 어려워서 네가 정해줘',
  'I want to build an app, but this question is too hard, so you decide',
];

const explicitPauses = [
  '잠깐만요', '나중에 할게요', '생각해볼게요', '그만할래', '여기까지', '잠깐만, 나중에 답할게',
  'let me think', 'Later', 'stop', 'pause', 'Hold on', "I'll answer later", 'give me a second',
];

describe('explicit growth controls', () => {
  it('keeps the ordinary answers from issue #6 as answers', () => {
    for (const answer of issueAnswers) {
      expect(detectGrowthInputIntent(answer), answer).toBe('answer');
      expect(isGrowthPauseRequest(answer), answer).toBe(false);
      expect(isQuestionChangeRequest(answer), answer).toBe(false);
    }
  });

  it('keeps answers that start like a control phrase as answers', () => {
    expect(controlLikeAnswers.length).toBeGreaterThanOrEqual(20);
    for (const answer of controlLikeAnswers) expect(detectGrowthInputIntent(answer), answer).toBe('answer');
  });

  it('still recognizes explicit requests to change the question', () => {
    for (const request of explicitQuestionChanges) {
      expect(detectGrowthInputIntent(request), request).toBe('change-question');
      expect(isQuestionChangeRequest(request), request).toBe(true);
    }
  });

  it('still recognizes explicit pauses', () => {
    for (const request of explicitPauses) {
      expect(detectGrowthInputIntent(request), request).toBe('pause');
      expect(isGrowthPauseRequest(request), request).toBe(true);
    }
  });

  it('pauses only on an empty reply and offers another question for a content-free reaction', () => {
    for (const empty of ['', '   ']) expect(detectGrowthInputIntent(empty), JSON.stringify(empty)).toBe('pause');
    for (const reaction of ['ㅋㅋㅋ', 'ㅎㅎ', 'ㅠㅠ', 'ㅜㅜ', '?', '???', '...', '…']) {
      expect(detectGrowthInputIntent(reaction), reaction).toBe('change-question');
      expect(isGrowthPauseRequest(reaction), reaction).toBe(false);
    }
  });
});

describe('classifyGrowthInput', () => {
  /** Run with a configured OpenAI provider whose every reply is `content`. */
  async function withClassifier(content: string, run: (prompts: () => string[]) => Promise<void>): Promise<void> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-intent-classifier-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const prompts = (): string[] => fetchMock.mock.calls.map(([, init]) => {
      const body = JSON.parse(String(init?.body)) as { messages?: Array<{ content?: string }> };
      return body.messages?.[body.messages.length - 1]?.content ?? '';
    });
    try {
      await run(prompts);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  }

  it('settles explicit controls without calling the provider', async () => {
    await withClassifier('{"intent":"answer"}', async (prompts) => {
      await expect(classifyGrowthInput('패스', '누가 먼저 써볼까요?', 'openai', undefined, 'ko')).resolves.toBe('change-question');
      await expect(classifyGrowthInput('Can we skip this question?', 'Who is it for?', 'openai', undefined, 'en')).resolves.toBe('change-question');
      await expect(classifyGrowthInput('잠깐만요', '누가 먼저 써볼까요?', 'openai', undefined, 'ko')).resolves.toBe('pause');
      await expect(classifyGrowthInput('let me think', 'Who is it for?', 'openai', undefined, 'en')).resolves.toBe('pause');
      expect(prompts()).toEqual([]);
    });
  });

  it('lets the model keep a control-like ordinary answer as an answer', async () => {
    await withClassifier('{"intent":"answer"}', async (prompts) => {
      await expect(classifyGrowthInput('Later in the evening, after they get home from work', 'When would they use it?', 'openai', undefined, 'en')).resolves.toBe('answer');
      await expect(classifyGrowthInput('나중에 답장하려고 미뤄두다가 잊어버려요', '가장 불편한 순간은 언제예요?', 'openai', undefined, 'ko')).resolves.toBe('answer');
      expect(prompts()).toHaveLength(2);
      expect(prompts()[0]).toContain('GROW_INPUT_CLASSIFY');
      expect(prompts()[0]).toContain('question: When would they use it?');
      expect(prompts()[0]).toContain('latestUserText: Later in the evening, after they get home from work');
    });
  });

  it("uses the model's change-question and pause labels for text that is not an explicit control", async () => {
    await withClassifier('{"intent":"change-question"}', async (prompts) => {
      await expect(classifyGrowthInput('I am not sure what you want from me', 'Who is it for?', 'openai', undefined, 'en')).resolves.toBe('change-question');
      expect(prompts()).toHaveLength(1);
    });
    await withClassifier('pause', async (prompts) => {
      await expect(classifyGrowthInput('I have to pick up my kid now, talk soon', 'Who is it for?', 'openai', undefined, 'en')).resolves.toBe('pause');
      expect(prompts()).toHaveLength(1);
    });
  });

  it('keeps the reply as an answer when the model output names no intent', async () => {
    await withClassifier('I cannot decide what you mean yet.', async (prompts) => {
      await expect(classifyGrowthInput('예를 들어 학생들이 과제 마감을 자주 놓쳐요', '어떤 문제가 있나요?', 'openai', undefined, 'ko')).resolves.toBe('answer');
      await expect(classifyGrowthInput('Hold on to receipts automatically so nothing gets lost', 'What should it do first?', 'openai', undefined, 'en')).resolves.toBe('answer');
      expect(prompts()).toHaveLength(2);
    });
  });
});

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxLoader = pathToFileURL(path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href;
const entry = path.join(repoRoot, 'src', 'cli', 'index.ts');

describe('seed grow --answer with a control-like answer (scripted OpenAI provider)', () => {
  const answer = 'Later in the evening, after they get home from work';
  const prompts: string[] = [];
  let root: string;
  let work: string;
  let env: NodeJS.ProcessEnv;
  let server: Server;

  const seed = async <T>(...args: string[]): Promise<T> => {
    const { stdout } = await execFileAsync(process.execPath, ['--import', tsxLoader, entry, ...args, '--json', '--no-input', '--provider', 'openai'], { cwd: work, env, timeout: 60_000, windowsHide: true });
    return JSON.parse(stdout) as T;
  };

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'seed-intent-cli-'));
    work = path.join(root, 'work');
    const home = path.join(root, 'home');
    await mkdir(work);
    await mkdir(home, { recursive: true });
    // The classifier always says "answer", so only Seed's own explicit-control
    // check can turn a reply into a pause.
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { messages?: Array<{ content?: string }> };
        const prompt = body.messages?.[body.messages.length - 1]?.content ?? '';
        prompts.push(prompt);
        const value = (label: string): string => prompt.match(new RegExp(`(?:^|\\n)${label}:([^\\n]*)`))?.[1]?.trim() ?? '';
        const content = prompt.includes('GROW_INPUT_CLASSIFY') ? { intent: 'answer' }
          : prompt.includes('GROW_UPDATE') ? { updatedSummary: `${value('coreIdea') || value('originalIdea')} — ${value('latestAnswer')}`, questionReason: 'I folded your answer into the idea.', contradictionsDetected: [], suggestions: [], maturityDelta: 5 }
            : value('users') ? { question: 'What moment is hardest for them?', maturityDelta: 5, focus: 'problem' }
              : { question: 'Who would you most like to try this idea first?', maturityDelta: 5, focus: 'user' };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/v1`;
    const inherited: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(inherited)) if (key.startsWith('SEED_') || /API_KEY$/.test(key)) delete inherited[key];
    env = { ...inherited, SEED_HOME: home, SEED_LANG: 'en', SEED_OPENAI_AUTH_FILE: path.join(home, 'missing-auth.json'), SEED_OPENAI_API_KEY: 'test-key', SEED_OPENAI_BASE_URL: baseUrl, NO_COLOR: '1', FORCE_COLOR: '0' };
    await writeFile(path.join(home, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'openai', type: 'openai', defaultModel: 'test-model', enabled: true, baseUrl }] }));
    await seed('A dinner planner for shift workers');
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });

  it('records the answer instead of pausing', async () => {
    const grown = await seed<{ after?: string; paused?: boolean }>('grow', '--answer', answer);
    expect(grown.paused).toBeUndefined();
    expect(grown.after).toContain(answer);
    expect(prompts.some((prompt) => prompt.includes('GROW_INPUT_CLASSIFY') && prompt.includes(`latestUserText: ${answer}`))).toBe(true);
    const saved = JSON.parse(await readFile(path.join(work, '.seed', 'seed.json'), 'utf8')) as { users: string[] };
    expect(saved.users).toContain(answer);
  }, 60_000);

  it('still pauses on an explicit "later" without asking the model', async () => {
    const asked = prompts.length;
    const paused = await seed<{ after?: string; paused?: boolean }>('grow', '--answer', 'later');
    expect(paused.paused).toBe(true);
    expect(paused.after).toBeUndefined();
    expect(prompts.slice(asked).some((prompt) => prompt.includes('GROW_INPUT_CLASSIFY'))).toBe(false);
  }, 60_000);
});
