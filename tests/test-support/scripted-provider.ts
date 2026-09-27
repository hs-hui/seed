import { vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { GrowthFocus } from '../../src/domain.js';

/**
 * Deterministic scripted responses for a mocked OpenAI-compatible provider,
 * used only by tests. This intentionally mirrors the retired local fallback
 * provider's content so existing test expectations stay meaningful, while
 * production code now requires a real configured AI provider for every
 * AI-backed call.
 */
function scriptedResponse(prompt: string, language: 'en' | 'ko'): string {
  if (prompt.includes('BRANCH_SUGGEST')) {
    return JSON.stringify({ branches: language === 'ko' ? [
      { name: '집중 워크플로', summary: '가장 필요한 한 가지부터 해결합니다.' },
      { name: '가이드 경험', summary: '대상 사용자를 위한 단계별 경험으로 발전시킵니다.' },
      { name: '다른 도구와 연결', summary: '핵심 가치를 다른 서비스에서도 쓰게 합니다.' },
    ] : [
      { name: 'Focused workflow', summary: 'Solve one important problem first.' },
      { name: 'Guided experience', summary: 'Guide the first person through a simple step-by-step experience.' },
      { name: 'Tool connection', summary: 'Let other tools use the main benefit later.' },
    ] });
  }
  if (prompt.includes('PRUNE_SUGGEST')) {
    return JSON.stringify({ items: language === 'ko' ? [
      { item: '팀 협업', reason: '핵심 사용 흐름이 제대로 되는지 보기 전에 팀 조율까지 넓힙니다.' },
      { item: '모바일 앱', reason: '처음 확인할 때 필요하지 않은 두 번째 화면을 만듭니다.' },
      { item: '고급 연동', reason: '사람들이 실제로 쓰는 핵심 흐름이 자리 잡은 뒤로 미뤄도 됩니다.' },
    ] : [
      { item: 'Team collaboration', reason: 'Adds team coordination before the core workflow is proven.' },
      { item: 'Mobile application', reason: 'Creates a second surface that is not required for the first proof.' },
      { item: 'Advanced integrations', reason: 'Can wait until the main way people use it is useful.' },
    ] });
  }
  if (prompt.includes('EVOLVE_SUGGEST')) {
    return JSON.stringify({ suggestions: language === 'ko' ? [
      { name: '더 좁은 첫 경험', summary: '처음 만나는 사람의 문제 하나를 가장 빠르게 해결하는 형태로 발전시킵니다.' },
      { name: '팀 확장', summary: '개인 사용 경험을 팀의 공유·협업 흐름으로 확장합니다.' },
      { name: '다른 도구와 연결', summary: '이미 반응이 좋은 핵심 가치를 다른 도구로 넓혀갑니다.' },
    ] : [
      { name: 'Narrower first experience', summary: 'Build the next version around one important problem.' },
      { name: 'Team expansion', summary: 'Extend the individual experience into a shared team flow.' },
      { name: 'Tool connection', summary: 'Let other tools use the main benefit later.' },
    ] });
  }
  const value = (label: string): string => prompt.match(new RegExp(`(?:^|\\n)${label}:([^\\n]*)`))?.[1]?.trim() ?? '';
  const short = (text: string, limit = 54): string => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
  };
  const objectForm = (text: string): string => {
    const clean = text.trim().replace(/[.!?,。！？]+$/g, '').trim();
    const last = clean.codePointAt(clean.length - 1);
    if (last === undefined) return clean;
    if (last >= 0xac00 && last <= 0xd7a3) return `${clean}${(last - 0xac00) % 28 === 0 ? '를' : '을'}`;
    return `${clean}을`;
  };
  const seenQuestions = (): string[] => `${value('answeredQuestions')} | ${value('previouslyAskedQuestions')}`
    .split(' | ').map((item) => item.trim()).filter(Boolean);
  const nextUnused = (candidates: string[]): string => candidates.find((candidate) => !seenQuestions().includes(candidate)) ?? candidates[0]!;
  if (prompt.includes('WATER_PERSPECTIVES')) {
    return JSON.stringify({ perspectives: language === 'ko' ? [
      { id: 'user', name: '사용자', question: '누가 이 아이디어를 매일 쓰고 싶어 할까요?' },
      { id: 'value', name: '가치', question: '누군가의 행동이나 결과를 어떻게 바꿀까요?' },
      { id: 'technical', name: '첫 단계', question: '처음에는 무엇 하나만 해보면 좋을까요?' },
      { id: 'experience', name: '첫 경험', question: '처음 30초 안에 무엇을 해보게 할까요?' },
    ] : [
      { id: 'user', name: 'User', question: 'Who would want to use this every day?' },
      { id: 'value', name: 'What changes', question: 'What is one thing that should feel different after using it?' },
      { id: 'technical', name: 'First step', question: 'What is one small thing to try first?' },
      { id: 'experience', name: 'First moment', question: 'What should the user do in the first 30 seconds?' },
    ] });
  }
  if (prompt.includes('WATER_DETAIL')) {
    const perspective = value('perspective'); const answer = value('question');
    const reflectionMatch = prompt.match(/User reflection: ([^\n]*)/);
    const reflection = reflectionMatch?.[1]?.trim();
    return JSON.stringify({
      title: perspective,
      summary: reflection
        ? (language === 'ko' ? `${perspective} 관점에서 "${reflection}"라는 생각을 바탕으로 더 살펴봤습니다.` : `The ${perspective} lens, building on: "${reflection}".`)
        : (language === 'ko' ? `${perspective} 관점에서 아이디어를 살펴봤습니다.` : `A first pass through the ${perspective} lens.`),
      points: [reflection || answer || (language === 'ko' ? '이 관점에서 확인할 점을 한 가지 골라보세요.' : 'Choose one thing to check from this angle.')],
      assumptions: [language === 'ko' ? '이 관점의 가치는 실제 사용자 반응으로 확인해야 합니다.' : 'People using it will tell us whether this angle is useful.'],
    });
  }
  if (prompt.includes('SUNLIGHT_ANALYZE')) {
    const idea = value('coreIdea');
    return JSON.stringify({
      areas: language === 'ko' ? [
        { name: '사용자', findings: [`${idea}를 실제로 사용할 사람과 현재 대안을 확인해야 합니다.`], facts: [], estimates: ['초기 사용자는 문제를 이미 자주 겪는 사람일 가능성이 있습니다.'] },
        { name: '경쟁과 대안', findings: ['기존 앱·문서·수작업이 어떤 대안으로 쓰이는지 비교해야 합니다.'], facts: [], estimates: ['새 도구가 기존 습관보다 분명히 편해야 전환이 일어납니다.'] },
        { name: '처음 만들기', findings: ['처음 만들 때 필요한 것과 드는 비용을 작게 확인하세요.'], facts: [], estimates: ['작은 시도로 실제로 되는지 먼저 알아볼 수 있습니다.'] },
      ] : [
        { name: 'Users', findings: [`Identify who would use ${idea} and what they use today.`], facts: [], estimates: ['Early adopters are likely to be people who already feel this pain often.'] },
        { name: 'Competition and alternatives', findings: ['Compare existing apps, documents, and manual workarounds.'], facts: [], estimates: ['A new tool must be clearly easier than an existing habit to earn a switch.'] },
        { name: 'First build', findings: ['Check the first version’s needs, daily work, and cost limits.'], facts: [], estimates: ['A small try-out can show whether it is possible.'] },
      ],
      assumptions: language === 'ko' ? ['사용자가 현재 방식보다 이 아이디어를 선택할 이유가 있다.'] : ['Users have a reason to choose this over their current approach.'],
      openQuestions: language === 'ko' ? ['실제 사용자가 지금 이 문제를 어떻게 해결하고 있나요?'] : ['How do real users solve this problem today?'],
    });
  }
  if (prompt.includes('GROW_QUESTION') && value('currentBranch') !== '' && value('currentBranch') !== 'none') {
    const branchValue = value('currentBranch');
    const branch = short(branchValue.split(' — ')[0] ?? branchValue);
    const answered = `${value('answeredQuestions')} | ${value('previouslyAskedQuestions')}`.split(' | ').map((item) => item.trim()).filter(Boolean);
    const candidates = language === 'ko' ? [
      `${branch}로 누가 어떤 순간에 도움을 받으면 좋을까요?`,
      `${branch}가 도움이 됐다는 걸 어떻게 알 수 있을까요?`,
      `${branch}의 첫 화면에서 꼭 필요한 것은 무엇일까요?`,
      `${branch}를 아주 작게 만들어 먼저 보여준다면 무엇일까요?`,
      `${branch}를 선택한 가장 큰 이유는 무엇인가요?`,
      `${branch}를 써본 사람이 가장 먼저 얻을 결과는 무엇일까요?`,
      `${branch} 대신 사람들이 지금 하는 방법은 무엇인가요?`,
      `${branch}에서 나중으로 미뤄도 되는 것은 무엇일까요?`,
    ] : [
      `What concrete moment should the ${branch} direction solve first?`,
      `What would show that the ${branch} direction works?`,
      `What should the first ${branch} version deliberately leave out?`,
      `What is the smallest version of the ${branch} direction we could try?`,
      `What is the strongest reason to choose the ${branch} direction?`,
      `What outcome would a user expect from the ${branch} direction?`,
      `What alternative do users rely on instead of the ${branch} direction?`,
      `What can the ${branch} direction leave for later?`,
    ];
    const question = candidates.find((candidate) => !answered.includes(candidate)) ?? candidates[0]!;
    return JSON.stringify({ question, maturityDelta: 3, focus: 'validation' });
  }
  if (prompt.includes('GROW_UPDATE')) {
    const coreIdea = value('coreIdea');
    const originalIdea = value('originalIdea');
    const problem = value('problem');
    const users = value('users').split(',').map((item) => item.trim()).filter(Boolean)[0] ?? '';
    const goal = value('goals').split('|').map((item) => item.trim()).filter(Boolean)[0] ?? '';
    const constraint = value('constraints').split('|').map((item) => item.trim()).filter(Boolean)[0] ?? '';
    const branchContext = value('currentBranch');
    const answer = value('latestAnswer');
    const quotedObject = (text: string): string => {
      const clean = text.replace(/[.!?,。！？]+$/, '').trim();
      return `“${clean}”${objectForm(clean).slice(clean.length)}`;
    };
    const baseSummary = branchContext && branchContext !== 'none'
      ? coreIdea
      : language === 'ko' && (users || problem || goal)
        ? `${originalIdea || coreIdea} — ${users ? `${quotedObject(users)} 위한 ` : ''}${problem ? `${quotedObject(problem)} 덜어주고 ` : ''}${goal ? `${quotedObject(goal)} 돕는 ` : ''}${constraint ? `“${constraint}” 중심 ` : ''}아이디어`.replace(/\s+/g, ' ').trim()
        : language === 'en' && (users || problem || goal)
          ? `${originalIdea || coreIdea} — ${users ? `for ${users}` : 'for the user'}${problem ? `, helping with “${problem}”` : ''}${goal ? ` to reach “${goal}”` : ''}${constraint ? `; first version: “${constraint}”` : ''}`
          : coreIdea;
    const updatedSummary = `${baseSummary}${answer && !baseSummary.includes(answer) ? ` — ${answer}` : ''}`.slice(0, 240);
    const maturityDelta = Math.max(3, Math.min(8, 2 + Math.ceil(answer.length / 80)));
    const suggestions = answer.length > 160
      ? [language === 'ko' ? '첫 버전에서 꼭 필요한 한 가지로 범위를 더 좁혀보세요.' : 'Narrow the first version to one must-have outcome.']
      : [];
    return JSON.stringify({
      updatedSummary,
      questionReason: language === 'ko' ? '방금 답변을 현재 아이디어에 반영했습니다.' : 'I folded your answer into the current idea.',
      contradictionsDetected: [], suggestions, maturityDelta,
    });
  }
  if (prompt.includes('BLOOM_EVALUATE')) {
    const dims = ['problem', 'user', 'core value', 'differentiation', 'scope', 'feasibility', 'motivation', 'confidence'];
    return JSON.stringify({
      dimensions: dims.map((name) => ({ name, score: 65, reason: language === 'ko' ? '현재 Seed 상태에서 근거가 확인됩니다.' : 'Supported by the current seed state.' })),
      clear: dims.slice(0, 4), uncertain: dims.slice(4), explore: dims.slice(4, 6),
    });
  }
  const coreIdea = value('coreIdea');
  const originalIdea = value('originalIdea');
  const problem = value('problem'); const users = value('users'); const goals = value('goals');
  const constraints = value('constraints'); const assumptions = value('assumptions');
  let focus: GrowthFocus; let question: string;
  if (!users) {
    focus = 'user';
    question = nextUnused(language === 'ko' ? [
      '이 아이디어를 가장 먼저 써봤으면 하는 사람은 누구예요?',
      '처음 도움을 받고 싶은 사람을 한 명만 떠올리면 누구예요?',
      '이 아이디어가 꼭 필요한 사람은 어떤 사람인가요?',
    ] : [
      'Who would you most like to try this idea first?',
      'Who is the first person you want this idea to help?',
      'Who needs this idea most right now?',
    ]);
  } else if (!problem) {
    focus = 'problem';
    question = nextUnused(language === 'ko' ? [
      `"${short(users)}"인 사람이 가장 답답하거나 막히는 순간은 언제예요?`,
      `"${short(users)}"인 사람이 자주 포기하게 되는 순간은 언제예요?`,
      `"${short(users)}"인 사람이 지금 가장 불편해하는 일은 무엇인가요?`,
    ] : [
      `What moment is hardest for "${short(users)}"?`,
      `When does "${short(users)}" tend to give up or get stuck?`,
      `What is most frustrating for "${short(users)}" today?`,
    ]);
  } else if (!goals) {
    focus = 'goal';
    question = nextUnused(language === 'ko' ? [
      '이 문제를 겪는 사람에게 무엇이 달라지면 도움이 됐다고 느낄까요?',
      '사용자가 오늘 바로 얻었으면 하는 가장 작은 결과는 무엇인가요?',
      '이 아이디어가 잘 작동했다고 느낄 순간은 언제인가요?',
    ] : [
      `What change would make someone in "${short(users)}" say, "That helped"?`,
      'What is the smallest result you want the user to get today?',
      'When would you feel that this idea genuinely worked?',
    ]);
  } else if (!constraints) {
    focus = 'constraint';
    question = nextUnused(language === 'ko' ? [
      `${objectForm(short(goals))} 위해 처음에는 무엇 하나만 만들까요?`,
      '처음에는 무엇을 빼도 괜찮을까요?',
      '처음에는 어떤 사람만 도와볼까요?',
    ] : [
      `To reach "${short(goals)}", what is the one thing to build first?`,
      'What can we leave out at first?',
      'Who should we help first?',
    ]);
  } else if (!assumptions) {
    focus = 'assumption';
    question = nextUnused(language === 'ko' ? [
      '처음 써볼 사람에게 무엇을 보여주면 좋을까요?',
      '처음 써볼 때 어떤 행동부터 해보면 좋을까요?',
      '처음 써본 사람에게 어떤 반응을 듣고 싶나요?',
    ] : [
      `With "${short(constraints)}" in mind, what should we try first?`,
      'How could we quickly learn whether this idea works?',
      'What would you like to hear from the first person who tries it?',
    ]);
  } else {
    focus = 'validation';
    const answeredQuestions = `${value('answeredQuestions')} | ${value('previouslyAskedQuestions')}`.split(' | ').map((item) => item.trim()).filter(Boolean);
    const validationQuestions = language === 'ko' ? [
      `${objectForm(short(originalIdea || coreIdea))} 써본 사람에게 무엇을 가장 먼저 확인해볼까요?`,
      '이 아이디어가 정말 도움이 됐다는 걸 어떻게 알 수 있을까요?',
      '첫 사용에서 막힐 수 있는 지점은 어디일까요?',
      '써본 뒤 무엇이 달라지면 다시 쓰고 싶을까요?',
      '사람들이 지금은 이 문제를 어떻게 해결하고 있나요?',
      '만들기 전에 가장 먼저 확인해 볼 한 가지는 무엇일까요?',
      '써본 사람이 별로라고 느끼면 무엇을 바꿔볼까요?',
      '만들기 전에 누구에게 어떤 반응을 들어보고 싶나요?',
      '어떤 상황에서 이 아이디어를 가장 먼저 써볼까요?',
      '한 번 써본 사람이 다시 찾게 하려면 무엇이 필요할까요?',
      '이 아이디어가 도움이 되지 않는다면 어떤 이유일까요?',
      '처음으로 도움이 됐다고 느끼기까지 얼마나 빨라야 할까요?',
    ] : [
      `After someone tries "${short(originalIdea || coreIdea)}", what would you learn first?`,
      'What would show that this idea really helped?',
      'Where might the first user get stuck?',
      'What would make someone want to use it again?',
      'How do people solve this problem today?',
      'Before building, what one thing should we check first?',
      'What result would make you change this idea?',
      'Who could try it before we build more?',
      'In what situation would someone try this first?',
      'What might make someone come back after trying it once?',
      'If this did not help, what might be the reason?',
      'How quickly should someone feel the first useful result?',
    ];
    question = validationQuestions.find((candidate) => !answeredQuestions.includes(candidate)) ?? validationQuestions[0]!;
  }
  return JSON.stringify({ question, maturityDelta: 3, focus });
}

/**
 * Sets up a temporary SEED_HOME with a scripted OpenAI provider so AI-backed
 * core functions can run in tests without a real network connection. Returns
 * a cleanup function that must be called (typically in an `afterEach`).
 */
export async function useScriptedProvider(): Promise<() => Promise<void>> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seed-scripted-provider-'));
  const previousHome = process.env.SEED_HOME;
  const previousKey = process.env.SEED_OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.SEED_HOME = root;
  process.env.SEED_OPENAI_API_KEY = 'test-key';
  await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
  globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages?: Array<{ content?: string }> };
    const prompt = body.messages?.[body.messages.length - 1]?.content ?? '';
    const language: 'en' | 'ko' = /[가-힣]/.test(prompt) ? 'ko' : 'en';
    return new Response(JSON.stringify({ choices: [{ message: { content: scriptedResponse(prompt, language) } }] }), { status: 200 });
  }) as typeof fetch;
  return async () => {
    globalThis.fetch = originalFetch;
    if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
    if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
    await rm(root, { recursive: true, force: true });
  };
}
