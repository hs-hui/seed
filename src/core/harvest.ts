import path from 'node:path';
import { ensureDir, atomicWrite, listFiles } from '../utils/fs.js';
import { SeedState, HarvestType } from '../domain.js';
import { SeedStore } from '../storage/store.js';
import { addEvent } from './seed-manager.js';

const harvestTypes: HarvestType[] = ['idea', 'brief', 'prd', 'trd', 'readme', 'prompt'];
const titles: Record<HarvestType | 'all', string> = {
  idea: 'Idea Card', brief: 'Project Brief', prd: 'Product Requirements Document', trd: 'Technical Requirements Document',
  readme: 'README', prompt: 'Coding Prompt', all: 'all documents',
};

function bullets(values: string[], fallback = '- TBD'): string { return values.length ? values.map((value) => `- ${value}`).join('\n') : fallback; }
function openQuestions(seed: SeedState): string { return bullets(seed.openQuestions.filter((question) => question.status === 'open').map((question) => `${question.question} (${question.importance})`), '- None recorded'); }

function render(seed: SeedState, type: HarvestType, lang: 'en' | 'ko'): string {
  const ko = lang === 'ko';
  if (type === 'idea') return `# ${seed.name}\n\n## ${ko ? '한 줄 아이디어' : 'One-line Idea'}\n${seed.coreIdea}\n\n## ${ko ? '대상 사용자' : 'Target User'}\n${seed.users.join(', ') || 'TBD'}\n\n## ${ko ? '문제' : 'Problem'}\n${seed.problem || 'TBD'}\n\n## ${ko ? '핵심 경험' : 'Core Experience'}\n${seed.goals.join('; ') || 'TBD'}\n\n## ${ko ? '핵심 인사이트' : 'Key Insight'}\n${seed.assumptions.join('; ') || 'TBD'}\n`;
  if (type === 'brief') return `# ${seed.name}\n\n- **Idea:** ${seed.coreIdea}\n- **Problem:** ${seed.problem || 'TBD'}\n- **Users:** ${seed.users.join(', ') || 'TBD'}\n- **Core experience:** ${seed.goals.join('; ') || 'TBD'}\n- **MVP:** ${seed.constraints.join('; ') || 'TBD'}\n- **Maturity:** ${seed.maturity}%\n`;
  if (type === 'readme') return `# ${seed.name}\n\n${seed.coreIdea}\n\n## Why\n${seed.problem || 'TBD'}\n\n## Features\n${bullets(seed.goals)}\n\n## Usage\nTBD\n\n## Development\nTBD\n\n## License\nTBD\n`;
  if (type === 'prompt') return `You are implementing ${seed.name}.\n\n## Context\n${seed.coreIdea}\n\n## Goals\n${bullets(seed.goals)}\n\n## Expected behavior\n${seed.problem || 'TBD'}\n\n## Constraints\n${bullets(seed.constraints)}\n\n## Acceptance criteria\n- Preserve existing files unless explicitly required.\n- Add tests for the core user flow.\n- Document any TBD or open question.\n`;
  if (type === 'prd') return `# ${ko ? '제품 요구사항 문서' : 'Product Requirements Document'}\n\n## 1. ${ko ? '제품 개요' : 'Product Overview'}\n**Name:** ${seed.name}\n\n**One-line:** ${seed.coreIdea}\n\n**Vision:** TBD\n\n**Background:** ${seed.problem || 'TBD'}\n\n## 2. ${ko ? '문제' : 'Problem'}\n${seed.problem || 'TBD'}\n\n## 3. ${ko ? '대상 사용자' : 'Target Users'}\n${bullets(seed.users)}\n\n## 4. ${ko ? '목표' : 'Goals'}\n${bullets(seed.goals)}\n\n## 5. ${ko ? '핵심 UX' : 'Core UX'}\nTBD — define the smallest loop that turns the problem into a useful outcome.\n\n## 6. ${ko ? '제품 기능' : 'Product Features'}\nTBD — derive features from confirmed decisions and the core user loop.\n\n## 7. ${ko ? 'MVP 범위' : 'MVP Scope'}\n- Must: ${seed.goals.join('; ') || 'TBD'}\n- Should: TBD\n- Future: TBD\n\n## 8. ${ko ? '차별화' : 'Differentiation'}\nTBD\n\n## 9. ${ko ? 'UX 원칙' : 'UX Principles'}\n- Ask one focused question at a time.\n- Reflect the user's answer in the summary.\n- Do not make decisions without confirmation.\n\n## 10. ${ko ? '성공 기준' : 'Success Criteria'}\nTBD\n\n## 11. ${ko ? '리스크' : 'Risks'}\nTBD\n\n## 12. ${ko ? '향후 기회' : 'Future Opportunities'}\nTBD\n\n## 13. ${ko ? '오픈 질문' : 'Open Questions'}\n${openQuestions(seed)}\n`;
  return `# ${ko ? '기술 요구사항 문서' : 'Technical Requirements Document'}\n\n## 1. Technical Overview\n${seed.name} is a local-first implementation of the following idea:\n\n${seed.coreIdea}\n\n## 2. Architecture\nCLI → domain engines → local JSON storage → optional LLM provider.\n\n## 3. Technology Stack\n- Node.js >= 18\n- TypeScript (strict, ESM)\n- Commander.js and Zod\n\n## 4. Runtime Environment\nWindows, macOS, and Linux terminals.\n\n## 5. Data Model\nSeed state, conversations, branches, decisions, open questions, and harvest results.\n\n## 6. Application Structure\nsrc/cli, src/core, src/ai, src/storage, and src/i18n.\n\n## 7. External Services\nOptional OpenAI, Gemini, Anthropic, or OpenAI-compatible provider.\n\n## 8. AI / LLM Architecture\nProvider abstraction with structured JSON responses and local fallback.\n\n## 9. State Management\nImmutable state updates persisted after each command.\n\n## 10. Storage\n.seed/ with atomic writes, rolling backup, and append-only history.\n\n## 11. CLI Architecture\nCommander commands with common --json, --lang, --provider, and --model options.\n\n## 12. Configuration\nGlobal ~/.seed/config.json, project overrides, and environment variable keys.\n\n## 13. Authentication\nAPI keys come from environment variables; OAuth Device Flow is TBD.\n\n## 14. Error Handling\nProvider failures fall back locally when possible and return actionable errors.\n\n## 15. Security Considerations\nAPI keys are never written to project .seed/ state.\n\n## 16. Performance Considerations\nRecent conversations are preferred; long histories should be summarized.\n\n## 17. Testing Strategy\nUnit tests for engines and integration tests for plant → grow → bloom → harvest.\n\n## 18. Deployment\nBuild with npm run build; publish as @seed-cli/seed.\n\n## 19. Observability\nLocal append-only events; telemetry is off by default.\n\n## 20. Technical Risks\nTBD — provider API changes, token cost, and schema migrations.\n\n## 21. Future Scalability\nAdditional providers, research, cloud sync, and web UI are Phase 2/3.\n\n## Open Questions\n${openQuestions(seed)}\n`;
}

async function harvestOne(store: SeedStore, seed: SeedState, type: HarvestType, lang: 'en' | 'ko'): Promise<string> {
  const dir = path.join(store.base, 'harvest'); await ensureDir(dir);
  const existing = (await listFiles(dir)).filter((file) => new RegExp(`${type}-v\\d+\\.md$`).test(file));
  const version = existing.length + 1; const file = path.join(dir, `${type}-v${version}.md`);
  await atomicWrite(file, render(seed, type, lang)); await addEvent(store, seed, 'harvest', `Harvested ${type}`, { file, version }); return file;
}
export async function harvest(store: SeedStore, seed: SeedState, type: HarvestType | 'all', lang: 'en' | 'ko'): Promise<string | string[]> {
  if (type === 'all') return Promise.all(harvestTypes.map((entry) => harvestOne(store, seed, entry, lang)));
  return harvestOne(store, seed, type, lang);
}
export function harvestTitle(type: HarvestType | 'all'): string { return titles[type]; }
