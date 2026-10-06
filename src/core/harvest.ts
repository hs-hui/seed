import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { ensureDir, atomicWrite, listFiles, withKeyedLock } from '../utils/fs.js';
import { buildHarvestInput, generateHarvestDocument } from '../ai/harvest-document.js';
import { Branch, ConversationEntry, HarvestResult, HarvestType, ResearchEntry, SeedState, now } from '../domain.js';
import { SeedStore } from '../storage/store.js';
import { addEvent } from './seed-manager.js';
import { t } from '../i18n/index.js';
import { assessHarvestReadiness } from './harvest-readiness.js';

const harvestTypes: HarvestType[] = ['idea', 'brief', 'prd', 'trd', 'readme', 'prompt'];
const harvestQueues = new Map<string, Promise<string>>();
function harvestQueueKey(store: SeedStore, type: HarvestType): string {
  const key = path.resolve(store.base, 'harvest', `${type}.md`);
  return process.platform === 'win32' ? key.toLocaleLowerCase() : key;
}
const titleKeys: Record<HarvestType | 'all', string> = {
  idea: 'harvest.type.idea', brief: 'harvest.type.brief', prd: 'harvest.type.prd', trd: 'harvest.type.trd',
  readme: 'harvest.type.readme', prompt: 'harvest.type.prompt', all: 'harvest.type.all',
};
type HarvestContext = { research: ResearchEntry[]; branches: Branch[]; conversations: ConversationEntry[] };
const harvestLanguage = new AsyncLocalStorage<'en' | 'ko'>();
function currentHarvestLanguage(): 'en' | 'ko' { return harvestLanguage.getStore() ?? 'en'; }
function bullets(values: string[], fallback = '- TBD'): string { return values.length ? values.map((value) => `- ${value}`).join('\n') : fallback; }
function openQuestions(seed: SeedState, lang: 'en' | 'ko' = currentHarvestLanguage()): string {
  return bullets(seed.openQuestions.filter((question) => question.status === 'open')
    .map((question) => `${question.question} (${question.importance})`), lang === 'ko' ? '- 기록된 오픈 질문이 없습니다.' : '- None recorded');
}
function researchLines(research: ResearchEntry[], lang: 'en' | 'ko'): string {
  if (!research.length) return lang === 'ko' ? '- 아직 저장된 리서치가 없습니다.' : '- No research has been saved yet.';
  return research.slice(-8).map((entry) => {
    const label = entry.isVerified ? (lang === 'ko' ? '검증됨' : 'verified') : entry.isEstimate ? (lang === 'ko' ? '추정' : 'estimate') : (lang === 'ko' ? '미검증' : 'unverified');
    return `- ${entry.title}: ${entry.summary.replace(/\n/g, ' ')} [${label}]`;
  }).join('\n');
}
function branchLines(branches: Branch[], lang: 'en' | 'ko' = currentHarvestLanguage()): string {
  return bullets(branches.filter((branch) => branch.status !== 'pruned').map((branch) => `${branch.name}: ${branch.summary}`), lang === 'ko' ? '- 기록된 브랜치가 없습니다.' : '- No branches recorded');
}
function answeredConversation(context: HarvestContext, lang: 'en' | 'ko' = currentHarvestLanguage()): string {
  const adoptedBranchIds = new Set(context.branches.filter((branch) => branch.status !== 'pruned').map((branch) => branch.id));
  const answers = context.conversations
    .filter((entry) => entry.role === 'user' && entry.type === 'answer' && entry.metadata?.intent !== 'change-question'
      && (!entry.branchId || adoptedBranchIds.has(entry.branchId)))
    .map((entry) => entry.content);
  return answers.length ? answers.map((answer) => `- ${answer}`).join('\n') : lang === 'ko' ? '- 기록된 답변이 없습니다.' : '- No answers recorded';
}
function decisionLines(seed: SeedState, branches: Branch[], lang: 'en' | 'ko' = currentHarvestLanguage()): string {
  const decisions = [...seed.decisions.filter((decision) => decision.confirmedByUser), ...branches.filter((branch) => branch.status !== 'pruned').flatMap((branch) => branch.decisions.filter((decision) => decision.confirmedByUser))]
    .filter((decision, index, all) => all.findIndex((candidate) => candidate.id === decision.id) === index);
  return decisions.length ? decisions.slice(-10).map((decision) => `- ${decision.decision} — ${decision.reason}`).join('\n') : lang === 'ko' ? '- 명시적으로 확정된 결정이 없습니다.' : '- No explicit decisions recorded';
}
function productUxEvidence(seed: SeedState, context: HarvestContext, lang: 'en' | 'ko'): string {
  const adoptedBranchIds = new Set(context.branches.filter((branch) => branch.status !== 'pruned').map((branch) => branch.id));
  const answers = context.conversations.filter((entry) => entry.role === 'user' && entry.type === 'answer'
    && entry.metadata?.intent !== 'change-question' && (!entry.branchId || adoptedBranchIds.has(entry.branchId)));
  const decisions = [...seed.decisions.filter((decision) => decision.confirmedByUser),
    ...context.branches.filter((branch) => branch.status !== 'pruned').flatMap((branch) => branch.decisions.filter((decision) => decision.confirmedByUser))]
    .filter((decision, index, all) => all.findIndex((candidate) => candidate.id === decision.id) === index);
  const evidence = [
    ...seed.goals.map((goal) => `- ${lang === 'ko' ? '목표' : 'Goal'}: ${goal}`),
    ...decisions.map((decision) => `- ${lang === 'ko' ? '사용자 확정 결정' : 'User-confirmed decision'}: ${decision.decision}${decision.reason ? ` — ${decision.reason}` : ''}`),
    ...answers.map((answer) => `- ${lang === 'ko' ? '사용자 답변' : 'User answer'}: ${answer.content}`),
  ];
  return evidence.length ? evidence.join('\n') : lang === 'ko' ? '- 미정 — 제품의 사용자 흐름과 UX 요구사항이 기록되지 않았습니다.' : '- TBD — no product user flow or UX requirements have been recorded.';
}

type SignalCategory = 'platform' | 'stack' | 'storage' | 'services' | 'ai' | 'auth' | 'security' | 'performance' | 'deployment';
type Evidence = { source: 'constraint' | 'decision' | 'answer' | 'goal' | 'assumption' | 'idea'; text: string };
type Signal = { term: string; evidence: Evidence };
// Keyword lexicon used to lift technical choices out of what the user actually
// said. Anything not matched here stays TBD instead of being invented.
const signalTerms: Record<SignalCategory, Array<[string, RegExp]>> = {
  platform: [['Web', /\bweb\b|웹/i], ['Mobile', /\bmobile\b|모바일/i], ['iOS', /\bios\b|아이폰/i], ['Android', /\bandroid\b|안드로이드/i], ['Desktop', /\bdesktop\b|데스크톱/i], ['CLI', /\bcli\b|command[- ]line|터미널/i], ['Browser extension', /browser extension|chrome extension|브라우저 확장/i], ['API', /\brest api\b|\bgraphql\b|\bapi\b/i], ['Slack app', /\bslack\b|슬랙/i], ['Discord bot', /\bdiscord\b|디스코드/i]],
  stack: [['React', /\breact\b(?! native)/i], ['React Native', /react native/i], ['Next.js', /\bnext\.?js\b/i], ['Vue', /\bvue\b/i], ['Svelte', /\bsvelte/i], ['Flutter', /\bflutter\b/i], ['Swift', /\bswift(ui)?\b/i], ['Kotlin', /\bkotlin\b/i], ['Node.js', /\bnode\.?js\b/i], ['TypeScript', /\btypescript\b/i], ['Python', /\bpython\b|파이썬/i], ['Django', /\bdjango\b/i], ['FastAPI', /\bfastapi\b/i], ['Rust', /\brust\b/i], ['Java', /\bjava\b/i], ['Spring', /\bspring boot\b/i], ['Electron', /\belectron\b/i], ['Tauri', /\btauri\b/i]],
  storage: [['PostgreSQL', /\bpostgres(ql)?\b/i], ['MySQL', /\bmysql\b/i], ['SQLite', /\bsqlite\b/i], ['MongoDB', /\bmongo(db)?\b/i], ['Redis', /\bredis\b/i], ['Supabase', /\bsupabase\b/i], ['Firebase', /\bfirebase\b|firestore/i], ['Local files', /local[- ]first|local files?|로컬 (저장|파일)/i], ['Spreadsheet', /spreadsheet|google sheets|스프레드시트/i]],
  services: [['Stripe', /\bstripe\b/i], ['Google Calendar', /google calendar|구글 캘린더/i], ['GitHub', /\bgithub\b/i], ['Notion', /\bnotion\b|노션/i], ['Email', /\bemail\b|이메일/i], ['Push notifications', /push notification|푸시 알림/i], ['Maps', /google maps|map api|지도 api/i], ['Payments', /\bpayments?\b|결제/i]],
  ai: [['LLM', /\bllm\b|\bgpt\b|openai|\bclaude\b|anthropic|gemini/i], ['AI', /\bai\b|인공지능|머신러닝|machine learning/i]],
  auth: [['Sign-in', /log ?in|sign[- ]?in|로그인/i], ['SSO / OAuth', /\bsso\b|oauth/i], ['Accounts', /\baccounts?\b|계정|회원/i], ['Permissions', /permission|role[- ]based|권한/i]],
  security: [['Privacy', /privacy|personal data|pii|개인정보|프라이버시/i], ['Security', /security|encrypt|보안|암호화/i], ['Compliance', /gdpr|hipaa|compliance|규정/i]],
  performance: [['Offline', /offline|오프라인/i], ['Real-time', /real[- ]?time|실시간/i], ['Latency', /latency|response time|지연 시간|응답 속도/i], ['Scale', /\bscale\b|many users|대규모|동시 사용자/i]],
  deployment: [['Vercel', /\bvercel\b/i], ['AWS', /\baws\b/i], ['GCP', /\bgcp\b|google cloud/i], ['Azure', /\bazure\b/i], ['Docker', /\bdocker\b/i], ['App Store', /app store|앱스토어/i], ['Play Store', /play store|플레이 ?스토어/i], ['npm', /\bnpm\b/i], ['Self-hosted', /self[- ]host|on[- ]prem|자체 호스팅/i]],
};
function trdEvidence(seed: SeedState, context: HarvestContext): Evidence[] {
  const adoptedBranches = context.branches.filter((branch) => branch.status !== 'pruned');
  const adoptedBranchIds = new Set(adoptedBranches.map((branch) => branch.id));
  const decisions = [...seed.decisions, ...adoptedBranches.flatMap((branch) => branch.decisions)].filter((decision) => decision.confirmedByUser);
  const answers = context.conversations.filter((entry) => entry.role === 'user' && entry.type === 'answer' && entry.metadata?.intent !== 'change-question'
    && (!entry.branchId || adoptedBranchIds.has(entry.branchId)));
  return [
    ...seed.constraints.map((text) => ({ source: 'constraint' as const, text })),
    ...decisions.map((decision) => ({ source: 'decision' as const, text: decision.reason ? `${decision.decision} — ${decision.reason}` : decision.decision })),
    ...answers.map((entry) => ({ source: 'answer' as const, text: entry.content })),
    ...seed.goals.map((text) => ({ source: 'goal' as const, text })),
    ...seed.assumptions.map((text) => ({ source: 'assumption' as const, text })),
    { source: 'idea' as const, text: seed.coreIdea },
  ].filter((entry) => entry.text.trim());
}
function detectSignals(evidence: Evidence[], category: SignalCategory): Signal[] {
  const found = new Map<string, Signal>();
  for (const [term, pattern] of signalTerms[category]) {
    // Earlier evidence sources (constraints, decisions) win as the cited reason.
    const hit = evidence.find((entry) => pattern.test(entry.text));
    if (hit && !found.has(term)) found.set(term, { term, evidence: hit });
  }
  return [...found.values()];
}
const sourceLabels: Record<Evidence['source'], [string, string]> = {
  constraint: ['constraint', '제약'], decision: ['confirmed decision', '확정된 결정'], answer: ['user answer', '사용자 답변'],
  goal: ['goal', '목표'], assumption: ['unverified assumption', '검증되지 않은 가정'], idea: ['core idea', '핵심 아이디어'],
};
function quote(text: string): string { const flat = text.replace(/\s+/g, ' ').trim(); return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat; }
function signalSection(signals: Signal[], ko: boolean, missing: [string, string]): string {
  if (!signals.length) return ko ? `- 미정 — ${missing[1]}` : `- TBD — ${missing[0]}`;
  return signals.map(({ term, evidence }) => {
    const [en, kr] = sourceLabels[evidence.source];
    const tentative = evidence.source === 'assumption' || evidence.source === 'idea' || evidence.source === 'goal';
    const note = tentative ? (ko ? ' (확정 전, 검증 필요)' : ' (not confirmed yet)') : '';
    return `- ${term}${note} — ${ko ? kr : en}: "${quote(evidence.text)}"`;
  }).join('\n');
}

function renderTrd(seed: SeedState, lang: 'en' | 'ko', context: HarvestContext, future: string[]): string {
  const ko = lang === 'ko';
  const evidence = trdEvidence(seed, context);
  const section = (category: SignalCategory, missing: [string, string]) => signalSection(detectSignals(evidence, category), ko, missing);
  const h = (en: string, kr: string) => (ko ? kr : en);
  const activeBranches = context.branches.filter((branch) => branch.status === 'active');
  const features = [...seed.goals, ...activeBranches.map((branch) => `${branch.name}: ${branch.summary}`)];
  const risks = [
    ...seed.assumptions.map((assumption) => h(`Unverified assumption: ${assumption}`, `검증되지 않은 가정: ${assumption}`)),
    ...seed.openQuestions.filter((question) => question.status === 'open').map((question) => h(`Open question: ${question.question}`, `오픈 질문: ${question.question}`)),
  ];
  const tbd = (en: string, kr: string) => (ko ? `- 미정 — ${kr}` : `- TBD — ${en}`);
  const platform = section('platform', ['no target platform has been recorded. Decide where users will run it (web, mobile, desktop, CLI, chat app).', '대상 플랫폼이 기록되지 않았습니다. 사용자가 어디서 쓰는지(웹, 모바일, 데스크톱, CLI, 메신저) 결정하세요.']);
  return `# ${h('Technical Requirements Document', '기술 요구사항 문서')}

> ${h('Derived from the seed state. Items marked TBD have no supporting decision, constraint, or answer yet; decide them before implementation.', 'Seed 상태에서 도출한 문서입니다. "미정" 항목은 뒷받침하는 결정·제약·답변이 아직 없으므로 구현 전에 결정해야 합니다.')}

**${h('Maturity', '성숙도')}:** ${seed.maturity}%

## 1. ${h('Technical Overview', '기술 개요')}
**${seed.name}** — ${seed.coreIdea}

- ${h('Problem', '문제')}: ${seed.problem || 'TBD'}
- ${h('Users', '사용자')}: ${seed.users.join(', ') || 'TBD'}

## 2. ${h('Architecture', '아키텍처')}
${h('Target platforms and interfaces:', '대상 플랫폼과 인터페이스:')}
${platform}

## 3. ${h('Technology Stack', '기술 스택')}
${section('stack', ['no language or framework has been chosen. Record a decision with \`seed decide\` once the platform is settled.', '언어나 프레임워크가 선택되지 않았습니다. 플랫폼이 정해지면 \`seed decide\`로 결정을 기록하세요.'])}

## 4. ${h('Runtime Environment', '실행 환경')}
${platform}

## 5. ${h('Data Model', '데이터 모델')}
${features.length ? `${h('Entities should be derived from these required capabilities:', '다음 필요 기능에서 엔티티를 도출합니다:')}\n${bullets(features)}` : tbd('no goals recorded yet, so no entities can be derived.', '기록된 목표가 없어 엔티티를 도출할 수 없습니다.')}

## 6. ${h('Application Structure', '애플리케이션 구조')}
${features.length ? `${h('Candidate modules (one per capability):', '후보 모듈(기능별 하나):')}\n${bullets(features)}` : tbd('no capabilities recorded yet.', '기록된 기능이 없습니다.')}

## 7. ${h('External Services', '외부 서비스')}
${section('services', ['no external integrations have been mentioned.', '언급된 외부 연동이 없습니다.'])}

## 8. ${h('AI / LLM Architecture', 'AI / LLM 아키텍처')}
${section('ai', ['no AI capability has been requested; do not add one without a reason.', '요청된 AI 기능이 없습니다. 근거 없이 추가하지 마세요.'])}

## 9. ${h('State Management', '상태 관리')}
${tbd('choose once the platform and data model are settled.', '플랫폼과 데이터 모델이 정해진 뒤 결정합니다.')}

## 10. ${h('Storage', '저장소')}
${section('storage', ['no storage choice has been recorded.', '저장소 선택이 기록되지 않았습니다.'])}

## 11. ${h('Interfaces', '인터페이스')}
${platform}

## 12. ${h('Configuration', '설정')}
${bullets(seed.constraints, tbd('no constraints recorded.', '기록된 제약이 없습니다.'))}

## 13. ${h('Authentication', '인증')}
${section('auth', ['no account or sign-in requirement has been mentioned.', '계정이나 로그인 요구사항이 언급되지 않았습니다.'])}

## 14. ${h('Error Handling', '오류 처리')}
${tbd('define failure behavior for each external dependency listed above.', '위 외부 의존성마다 실패 시 동작을 정의하세요.')}

## 15. ${h('Security Considerations', '보안 고려사항')}
${section('security', ['no privacy or security requirement has been recorded. Confirm what user data is stored.', '개인정보·보안 요구사항이 기록되지 않았습니다. 어떤 사용자 데이터를 저장하는지 확인하세요.'])}

## 16. ${h('Performance Considerations', '성능 고려사항')}
${section('performance', ['no performance, offline, or scale requirement has been recorded.', '성능·오프라인·규모 요구사항이 기록되지 않았습니다.'])}

## 17. ${h('Testing Strategy', '테스트 전략')}
${seed.goals.length ? bullets(seed.goals.map((goal) => h(`Acceptance test: the target user can achieve "${goal}"`, `수락 테스트: 대상 사용자가 "${goal}"을(를) 달성할 수 있음`))) : tbd('add acceptance tests once goals are recorded.', '목표가 기록되면 수락 테스트를 추가합니다.')}

## 18. ${h('Deployment', '배포')}
${section('deployment', ['no hosting or distribution channel has been recorded.', '호스팅이나 배포 채널이 기록되지 않았습니다.'])}

## 19. ${h('Observability', '관측성')}
${tbd('decide which signals show that users reach the goals above.', '사용자가 위 목표에 도달하는지 보여줄 지표를 결정하세요.')}

## 20. ${h('Technical Risks', '기술적 위험')}
${bullets(risks, tbd('no assumptions or open questions recorded.', '기록된 가정이나 오픈 질문이 없습니다.'))}

## 21. ${h('Future Scalability', '향후 확장성')}
${bullets(future, tbd('no deferred directions recorded.', '보류된 방향이 없습니다.'))}

## ${h('Confirmed Decisions', '확정된 결정')}
${decisionLines(seed, context.branches, lang)}

## ${h('Open Questions', '오픈 질문')}
${openQuestions(seed, lang)}
`;
}

function renderReadme(seed: SeedState, lang: 'en' | 'ko'): string {
  const ko = lang === 'ko';
  const unknown = ko ? '미정 - 구현 및 사용 방법이 아직 기록되지 않았습니다.' : 'TBD - implementation and usage instructions have not been recorded.';
  return `# ${seed.name}

## ${ko ? '개요' : 'Overview'}
${seed.coreIdea}

## ${ko ? '해결할 문제' : 'Problem'}
${seed.problem || 'TBD'}

## ${ko ? '대상 사용자' : 'Target users'}
${bullets(seed.users)}

## ${ko ? '목표' : 'Goals'}
${bullets(seed.goals)}

## ${ko ? '범위와 제약' : 'Scope and constraints'}
${bullets(seed.constraints)}

## ${ko ? '설치 및 사용' : 'Installation and usage'}
${unknown}

## ${ko ? '열린 질문' : 'Open questions'}
${openQuestions(seed, lang)}
`;
}

function render(seed: SeedState, type: HarvestType, lang: 'en' | 'ko', context: HarvestContext): string {
  const ko = lang === 'ko';
  const branches = context.branches;
  const research = context.research;
  const vision = seed.goals[0] || (ko ? '사용자의 문제를 더 나은 결과로 바꿉니다.' : 'Turn the user problem into a better outcome.');
  const must = seed.constraints.length ? seed.constraints : seed.goals.slice(0, 1);
  const uxEvidence = productUxEvidence(seed, context, lang);
  const future = seed.prunedItems.length
    ? seed.prunedItems.map((item) => branches.find((branch) => branch.id === item)?.name ?? item)
    : branches.filter((branch) => branch.status === 'pruned').map((branch) => branch.name);
  if (type === 'idea') return `# ${seed.name}\n\n## ${ko ? '한 줄 아이디어' : 'One-line Idea'}\n${seed.coreIdea}\n\n## ${ko ? '대상 사용자' : 'Target User'}\n${seed.users.join(', ') || 'TBD'}\n\n## ${ko ? '문제' : 'Problem'}\n${seed.problem || 'TBD'}\n\n## ${ko ? '핵심 경험' : 'Core Experience'}\n${seed.goals.join('; ') || 'TBD'}\n\n## ${ko ? '핵심 인사이트' : 'Key Insight'}\n${seed.assumptions.join('; ') || 'TBD'}\n`;
  if (type === 'brief') return `# ${seed.name}\n\n- **${ko ? '아이디어' : 'Idea'}:** ${seed.coreIdea}\n- **${ko ? '문제' : 'Problem'}:** ${seed.problem || 'TBD'}\n- **${ko ? '사용자' : 'Users'}:** ${seed.users.join(', ') || 'TBD'}\n- **${ko ? '핵심 경험' : 'Core experience'}:** ${seed.goals.join('; ') || 'TBD'}\n- **${ko ? 'MVP' : 'MVP'}:** ${must.join('; ') || 'TBD'}\n- **${ko ? '방향' : 'Directions'}:** ${branches.filter((branch) => branch.status === 'active').map((branch) => branch.name).join(', ') || 'TBD'}\n- **${ko ? '성숙도' : 'Maturity'}:** ${seed.maturity}%\n`;
  if (type === 'readme') return renderReadme(seed, lang);
  if (type === 'prompt') return ko ? `# ${seed.name} 구현 작업 지시서\n\n## 맥락\n${seed.coreIdea}\n\n## 목표\n${bullets(seed.goals)}\n\n## 기대 동작\n${seed.problem || 'TBD'}\n\n## 제약\n${bullets(seed.constraints)}\n\n## 근거와 결정\n${answeredConversation(context)}\n\n### 확정된 결정\n${decisionLines(seed, branches)}\n\n## 수락 기준\n- 명시적으로 필요한 경우를 제외하고 기존 파일을 보존합니다.\n- 핵심 사용자 흐름에 대한 테스트를 추가합니다.\n- 근거 없는 동작을 만들지 않습니다.\n- TBD와 오픈 질문을 문서화합니다.\n` : `You are implementing ${seed.name}.\n\n## Context\n${seed.coreIdea}\n\n## Goals\n${bullets(seed.goals)}\n\n## Expected behavior\n${seed.problem || 'TBD'}\n\n## Constraints\n${bullets(seed.constraints)}\n\n## Evidence and decisions\n${answeredConversation(context)}\n\n### Confirmed decisions\n${decisionLines(seed, branches)}\n\n## Acceptance criteria\n- Preserve existing files unless explicitly required.\n- Add tests for the core user flow.\n- Do not invent behavior not supported by the context.\n- Document any TBD or open question.\n`;
  if (type === 'prd') return `# ${ko ? '제품 요구사항 문서' : 'Product Requirements Document'}\n\n## 1. ${ko ? '제품 개요' : 'Product Overview'}\n**${ko ? '이름' : 'Name'}:** ${seed.name}\n\n**${ko ? '한 줄 설명' : 'One-line'}:** ${seed.coreIdea}\n\n**${ko ? '비전' : 'Vision'}:** ${vision}\n\n**${ko ? '배경' : 'Background'}:** ${seed.problem || 'TBD'}\n\n## 2. ${ko ? '문제' : 'Problem'}\n${seed.problem || 'TBD'}\n\n## 3. ${ko ? '대상 사용자' : 'Target Users'}\n${bullets(seed.users)}\n\n## 4. ${ko ? '목표' : 'Goals'}\n${bullets(seed.goals)}\n\n## 5. ${ko ? '핵심 UX' : 'Core UX'}\n${uxEvidence}\n\n## 6. ${ko ? '제품 기능' : 'Product Features'}\n${bullets([...seed.goals, ...branches.filter((branch) => branch.status === 'active').map((branch) => `${branch.name}: ${branch.summary}`)])}\n\n## 7. ${ko ? 'MVP 범위' : 'MVP Scope'}\n- ${ko ? '필수' : 'Must'}: ${must.join('; ') || 'TBD'}\n- ${ko ? '권장' : 'Should'}: ${branches.filter((branch) => branch.status === 'active').map((branch) => branch.name).join('; ') || 'TBD'}\n- ${ko ? '향후' : 'Future'}: ${future.join('; ') || 'TBD'}\n\n## 8. ${ko ? '차별화' : 'Differentiation'}\n${branchLines(branches)}\n\n### ${ko ? '근거' : 'Evidence'}\n${researchLines(research, lang)}\n\n## 9. ${ko ? 'UX 원칙' : 'UX Principles'}\n${uxEvidence}\n\n## 10. ${ko ? '성공 기준' : 'Success Criteria'}\n${bullets(seed.goals.map((goal) => ko ? `대상 사용자가 다음을 달성할 수 있습니다: ${goal}` : `The target user can achieve: ${goal}`))}\n\n## 11. ${ko ? '리스크' : 'Risks'}\n${bullets([...seed.assumptions.map((assumption) => ko ? `검증되지 않은 가정: ${assumption}` : `Unverified assumption: ${assumption}`), ...seed.openQuestions.filter((question) => question.status === 'open').map((question) => ko ? `오픈 질문: ${question.question}` : `Open question: ${question.question}`)])}\n\n## 12. ${ko ? '향후 기회' : 'Future Opportunities'}\n${bullets(future)}\n\n## 13. ${ko ? '오픈 질문' : 'Open Questions'}\n${openQuestions(seed)}\n`;
  return renderTrd(seed, lang, context, future);
}

async function harvestOneUnlocked(store: SeedStore, seed: SeedState, type: HarvestType, lang: 'en' | 'ko', draft: boolean, generated?: string): Promise<string> {
  const dir = path.join(store.base, 'harvest'); await ensureDir(dir);
  const existing = (await listFiles(dir)).filter((file) => new RegExp(`${type}-v\\d+\\.md$`).test(file));
  // Use the highest existing version rather than the file count. This keeps
  // harvesting append-only even when an older artifact was removed manually.
  const version = existing.reduce((highest, filePath) => {
    const match = filePath.match(new RegExp(`${type}-v(\\d+)\\.md$`));
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0) + 1;
  const file = path.join(dir, `${type}-v${version}.md`);
  const [research, branches, conversations] = await Promise.all([store.research(seed.id), store.branches(seed.id), store.conversations(seed.id)]);
  const context = { research, branches, conversations };
  const rendered = generated ?? harvestLanguage.run(lang, () => render(seed, type, lang, context));
  let content = rendered;
  if (type === 'prd' && generated === undefined) {
    // A PRD harvest should show where its claims came from, not only the
    // polished summary. Keep the maturity snapshot and the user's answers
    // beside the research and confirmed decisions.
    content = content.replace('\n## 2.', `\n\n**${lang === 'ko' ? '성숙도' : 'Maturity'}:** ${seed.maturity}%\n\n## 2.`);
    const evidenceHeading = `\n### ${lang === 'ko' ? '근거' : 'Evidence'}\n`;
    const evidenceBlock = `${evidenceHeading}${researchLines(research, lang)}`;
    content = content.replace(evidenceBlock, `${evidenceBlock}\n\n### ${lang === 'ko' ? '대화 근거' : 'Conversation evidence'}\n${answeredConversation(context, lang)}`);
    content = content.replace('\n## 9.', `\n\n### ${lang === 'ko' ? '확정된 결정' : 'Confirmed decisions'}\n${decisionLines(seed, branches, lang)}\n\n## 9.`);
  }
  if (draft) {
    const missing = assessHarvestReadiness(seed, type).missing;
    if (missing.length) {
      const labels = missing.map((item) => t(`harvest.evidence.${item}`, {}, lang)).join(', ');
      content = `> ${t('harvest.draftNotice', { missing: labels }, lang)}\n\n${content}`;
    }
  }
  await atomicWrite(file, content);
  const current = await store.load();
  const harvested = current.status === 'dormant' || current.status === 'harvested' ? current : { ...current, status: 'harvested' as const, updatedAt: now() };
  if (harvested.status !== current.status) await store.save(harvested);
  const result: HarvestResult = { id: randomUUID(), seedId: seed.id, type, version, content, createdAt: now(), maturitySnapshot: seed.maturity };
  await store.saveHarvestResult(result);
  await addEvent(store, harvested, 'harvest', `Harvested ${type}`, { file, version });
  return file;
}
async function harvestOne(store: SeedStore, seed: SeedState, type: HarvestType, lang: 'en' | 'ko', draft: boolean): Promise<string> {
  // Version discovery, markdown write, result record, and history event must
  // share one queue per document type so concurrent harvests stay append-only.
  const key = harvestQueueKey(store, type);
  const previous = harvestQueues.get(key) ?? Promise.resolve('');
  const operation = previous.catch(() => '').then(() => harvestOneUnlocked(store, seed, type, lang, draft));
  harvestQueues.set(key, operation);
  try { return await operation; }
  finally { if (harvestQueues.get(key) === operation) harvestQueues.delete(key); }
}
export async function harvest(store: SeedStore, seed: SeedState, type: HarvestType | 'all', lang: 'en' | 'ko', options: { draft?: boolean; ai?: boolean; providerId?: string; model?: string } = {}): Promise<string | string[]> {
  if (options.ai) {
    const statePath = path.join(store.base, 'seed.json');
    const snapshot = async () => {
      const current = await store.load();
      const [branches, conversations] = await Promise.all([store.branches(current.id), store.conversations(current.id)]);
      return { seed: current, branches, conversations };
    };
    const captured = await withKeyedLock(statePath, snapshot);
    if (captured.seed.status === 'dormant') throw new Error('seed-dormant');
    const types = type === 'all' ? harvestTypes : [type];
    if (!options.draft && types.some((entry) => !assessHarvestReadiness(captured.seed, entry).ready)) throw new Error('harvest-not-ready');
    const input = buildHarvestInput(captured.seed, captured.branches, captured.conversations);
    const documents = new Map<HarvestType, string>();
    // Generate AND verify the entire batch before saving the first file.
    for (const entry of types) documents.set(entry, await generateHarvestDocument(captured.seed, entry, lang, input, options));
    return withKeyedLock(statePath, async () => {
      if (JSON.stringify(await snapshot()) !== JSON.stringify(captured)) throw new Error('harvest-evidence-changed');
      const files: string[] = [];
      for (const entry of types) files.push(await harvestOneUnlocked(store, captured.seed, entry, lang, options.draft ?? false, documents.get(entry)));
      return type === 'all' ? files : files[0]!;
    });
  }
  if (type === 'all') {
    // Each harvest writes the seed status/history. Serialize the documents so
    // Windows atomic renames cannot race on the shared seed.json file.
    const files: string[] = [];
    for (const entry of harvestTypes) files.push(await harvestOne(store, seed, entry, lang, options.draft ?? false));
    return files;
  }
  return harvestOne(store, seed, type, lang, options.draft ?? false);
}
export function harvestTitle(type: HarvestType | 'all', lang: 'en' | 'ko' = 'en'): string { return t(titleKeys[type], {}, lang); }
