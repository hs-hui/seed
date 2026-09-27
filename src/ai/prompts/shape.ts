import type { SeedState } from '../../domain.js';
import type { WaterPerspective } from '../provider.js';

export function waterPerspectivesPrompt(seed: SeedState): string {
  return `WATER_PERSPECTIVES\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nProvide at least four distinct lenses (user, value, technical, experience or better). Return valid JSON only: {"perspectives":[{"id":"stable-id","name":"short name","question":"one conversational question"}]}`;
}

export function waterDetailPrompt(seed: SeedState, perspective: WaterPerspective): string {
  return `WATER_DETAIL\ncoreIdea: ${seed.coreIdea}\nperspective: ${perspective.name}\nquestion: ${perspective.question}\nExplore this lens without inventing facts. Return valid JSON only: {"title":"...","summary":"...","points":["2-4 concrete observations or prompts"],"assumptions":["unverified assumptions"]}`;
}

export function sunlightPrompt(seed: SeedState, webContext: string): string {
  return `SUNLIGHT_ANALYZE\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nwebSources: ${webContext}\nAnalyze at least three areas: users, competition/alternatives, and technology/constraints. Separate verified facts from estimates and never invent market numbers. Return valid JSON only: {"areas":[{"name":"...","findings":["..."],"facts":["..."],"estimates":["..."]}],"assumptions":["..."],"openQuestions":["..."]}`;
}

export function evolutionPrompt(seed: SeedState): string {
  return `EVOLVE_SUGGEST\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nSuggest 2-4 genuinely different next-generation directions. Return valid JSON only: {"suggestions":[{"name":"short direction","summary":"why this is a meaningful evolution"}]}`;
}

export function branchPrompt(seed: SeedState): string {
  return `BRANCH_SUGGEST\ncoreIdea: ${seed.coreIdea}\nReturn JSON only: {"branches":[{"name":"short direction","summary":"why it matters"}]}`;
}

export function prunePrompt(seed: SeedState): string {
  return `PRUNE_SUGGEST\ncoreIdea: ${seed.coreIdea}\nReturn JSON only: {"items":[{"item":"scope item","reason":"why to defer it"}]}`;
}

export function bloomPrompt(seed: SeedState, researchContext: string): string {
  return `BLOOM_EVALUATE\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\nsunlightResearch: ${researchContext}\nopenQuestions: ${seed.openQuestions.filter((question) => question.status === 'open').map((question) => question.question).join(' | ')}\nEvaluate the current idea without inventing facts. Return valid JSON only: {"dimensions":[{"name":"problem","score":0-100,"reason":"brief evidence-based reason"}],"clear":["..."],"uncertain":["..."],"explore":["..."]}. Include all eight dimensions: problem, user, core value, differentiation, scope, feasibility, motivation, confidence.`;
}
