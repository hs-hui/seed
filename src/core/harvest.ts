import path from 'node:path';
import { ensureDir, atomicWrite, listFiles } from '../utils/fs.js';
import { SeedState, HarvestType } from '../domain.js';
import { SeedStore } from '../storage/store.js';
import { addEvent } from './seed-manager.js';

const titles: Record<HarvestType, string> = { idea: 'Idea Card', brief: 'Project Brief', prd: 'Product Requirements Document', trd: 'Technical Requirements Document' };

function body(seed: SeedState, type: HarvestType, lang: 'en' | 'ko'): string {
  const ko = lang === 'ko';
  if (type === 'idea') return `# ${seed.name}\n\n## ${ko ? '한 줄 아이디어' : 'One-line Idea'}\n${seed.coreIdea}\n\n## ${ko ? '대상 사용자' : 'Target User'}\n${seed.users.join(', ') || 'TBD'}\n\n## ${ko ? '문제' : 'Problem'}\n${seed.problem || 'TBD'}\n\n## ${ko ? '핵심 경험' : 'Core Experience'}\n${seed.goals.join('; ') || 'TBD'}\n\n## ${ko ? '핵심 인사이트' : 'Key Insight'}\n${seed.assumptions.join('; ') || 'TBD'}\n`;
  if (type === 'brief') return `# ${seed.name}\n\n- **Idea:** ${seed.coreIdea}\n- **Problem:** ${seed.problem || 'TBD'}\n- **Users:** ${seed.users.join(', ') || 'TBD'}\n- **MVP:** ${seed.goals.join('; ') || 'TBD'}\n- **Maturity:** ${seed.maturity}%\n`;
  if (type === 'prd') return `# ${ko ? '제품 요구사항 문서' : 'Product Requirements Document'}\n\n## 1. ${ko ? '제품 개요' : 'Product Overview'}\n**Name:** ${seed.name}\n\n**One-line:** ${seed.coreIdea}\n\n## 2. ${ko ? '문제' : 'Problem'}\n${seed.problem || 'TBD'}\n\n## 3. ${ko ? '대상 사용자' : 'Target Users'}\n${seed.users.map((u) => `- ${u}`).join('\n') || '- TBD'}\n\n## 4. ${ko ? '목표' : 'Goals'}\n${seed.goals.map((g) => `- ${g}`).join('\n') || '- TBD'}\n\n## 5. ${ko ? '핵심 UX' : 'Core UX'}\nDefine the smallest loop that turns the problem into a useful outcome.\n\n## 6. ${ko ? 'MVP 범위' : 'MVP Scope'}\n- Must: TBD\n- Should: TBD\n- Future: TBD\n\n## 7. ${ko ? '오픈 질문' : 'Open Questions'}\n${seed.openQuestions.filter((q) => q.status === 'open').map((q) => `- ${q.question}`).join('\n') || '- None recorded'}\n`;
  return `# ${ko ? '기술 요구사항 문서' : 'Technical Requirements Document'}\n\n## 1. Technical Overview\n${seed.name} is a local-first CLI for the idea described below.\n\n**Core idea:** ${seed.coreIdea}\n\n## 2. Architecture\nCLI → domain engines → local JSON storage → optional LLM provider.\n\n## 3. Technology Stack\n- Node.js >= 18\n- TypeScript (strict, ESM)\n- Commander.js, Zod\n\n## 4. Runtime Environment\nWindows, macOS, and Linux terminals.\n\n## 5. Data Model\nSeed state, conversations, branches, decisions, open questions, and append-only history.\n\n## 6. Storage\n.seed/ with atomic writes and a rolling seed backup.\n\n## 7. AI / LLM Architecture\nProvider abstraction with local fallback and OpenAI-compatible API support.\n\n## 8. Testing Strategy\nUnit and integration tests with mocked providers.\n\n## 9. Open Questions\n${seed.openQuestions.filter((q) => q.status === 'open').map((q) => `- ${q.question}`).join('\n') || '- None recorded'}\n`;
}

export async function harvest(store: SeedStore, seed: SeedState, type: HarvestType, lang: 'en' | 'ko'): Promise<string> {
  const dir = path.join(store.base, 'harvest'); await ensureDir(dir);
  const existing = (await listFiles(dir)).filter((f) => new RegExp(`${type}-v\\d+\\.md$`).test(f));
  const version = existing.length + 1; const file = path.join(dir, `${type}-v${version}.md`);
  await atomicWrite(file, body(seed, type, lang)); await addEvent(store, seed, 'harvest', `Harvested ${type}`, { file, version }); return file;
}
export function harvestTitle(type: HarvestType): string { return titles[type]; }
