# 🌱 SEED — Technical Requirements Document (TRD)

> **Architecture, data model, and implementation blueprint for the Seed CLI.**
>
> 버전: v1.0 (작성일: 2026-08-29)
> 기반: Seed.md + PRD.md v1.0
> 상태: Draft

---

# 0. 문서 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| v0.1 | 2026-08-29 | Tech | Seed.md 기반 1차 초안 |
| v1.0 | 2026-08-29 | Tech | AI Provider 아키텍처 상세, config/f-11 반영, 스키마 확정 |
| v1.1 | 2026-08-29 | Tech | OQ1~7 반영: @seed-cli/seed(OQ2), 라이선스(OQ3), 로컬 미지원(OQ5), i18n 추가(OQ6, §25), OpenAI OAuth Device Flow 확정(OQ7) |

---

# 1. Technical Overview (기술 개요)

## 1.1 제품 요약

**Seed**는 Node.js 기반 CLI 도구로, 사용자의 아이디어를 AI(LM)와의 대화로 성장시키고, 성숙한 결과물을 수확하는 도구다.

## 1.2 핵심 기술 도전 (Key Technical Challenges)

| 도전 | 설명 |
|------|------|
| **Context Management** | 전체 대화를 매번 보내지 않고, 현재 상태에 필요한 Context만 조립 |
| **State Machine** | Seed의 상태(seedling→growing→blooming 등)를 안전하게 관리 |
| **AI Structured Output** | AI 응답에서 JSON/정보를 안정적으로 파싱 (hallucination/형식 불일치 대응) |
| **Non-blocking Storage** | 파일 기반 로컬 저장의 무결성 보장 (동시 접근, 깨짐 방지) |
| **Multi-Provider Abstraction** | OpenAI, Gemini, Claude, Custom 등 상이한 API를 하나의 인터페이스로 추상화 |
| **Safe Key Management** | API Key를 평문으로 디스크에 저장하지 않기 |
| **Resilient Networking** | API 실패, rate limit, 타임아웃에 대한 gracefull handling |
| **TUI Polish** | 스피너, 색상, 멀티라인 입력을 안정적으로 제공 |

---

# 2. Architecture (아키텍처)

## 2.1 클리어 레이어 아키텍처

```text
┌──────────────────────────────────────────────┐
│              CLI Layer (Commander.js)         │
│   cli/index.ts  ─►  commands/*.ts            │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│              Core Layer                       │
│  seed-manager / growth-engine / branch-engine│
│  maturity-engine / harvest-engine            │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│              AI Layer                          │
│  context-builder / provider (抽象) / prompts/ │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│              Storage Layer                     │
│  seed-store / conversation-store / branch-store│
│  config-store / secure-key-store              │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│              UI Layer (chalk/ink/prompts)      │
│  renderer / prompts / tree / spinner          │
└──────────────────────────────────────────────┘
```

## 2.2 의존성 관계

- **CLI → Core** : 명령어 처리가 Core 모듈에 위임
- **Core → AI**  : 성장/평가 시 AI 호출
- **Core → Storage** : 상태/대화 저장/로드
- **AI → Storage** : 프로바이더 설정 읽기
- **UI** : 다른 레이어 독립, 시각화 전담

## 2.3 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| ** immutability by default** | Seed 상태 변경은 새 객체 복사 후 저장 (원본 훼손 방지) |
| **Graceful degradation** | AI 실패 시 로컬에서 가능한 기능(tree/garden)은 계속 동작 |
| **Idempotent harvest** | 같은 상태에서多次 harvest해도 같은 결과 (버전 관리 포함) |
| **No file write without backup** | `.seed/` 저장 전 `.seed/.backup/`에 기존 파일 복사 (최근 1개만) |
| **Testable separation** | 각 엔진은 외부 의존성 주입 가능 (mock 테스트 용이) |

---

# 3. Technology Stack (기술 스택)

## 3.1 언어 및 런타임

| 항목 | 버전/리소 |
|------|-----------|
| 언어 | TypeScript (strict mode) |
| 런타임 | Node.js >= 18 LTS (Deno/Bun 고려 — Phase 2) |
| 패키지 매니저 | npm (Node.js 18이상 내장) |
| TypeScript | 5.x |
| 빌드 | `tsc` → ESM output |
| 모듈 형식 | **ESM** (TypeScript에서 `--module nodenext`) — Node.js 18 LTS 권장 |
| 타입 | `strict: true`, `noUncheckedIndexedAccess: true` 권장 |

## 3.2 핵심 라이브러리

| 라이브러리 | 용도 | 이유 |
|------------|------|------|
| `commander` | CLI 프레임워크 | 널리 사용, 단순 구조 |
| `chalk` | 터미널 색상 | 크로스플랫폼, 불필요한 ANSI 관리 |
| `ink` | React-style TUI (선택) | 복잡한 인터랙티브 UI(트리 등)에 유용 |
| `inquirer` 또는 `@inquirer/prompts` | 인터랙티브 선택 | 프롬프트, 컨펌트, 멀티셀렉트 |
| `ora` | 스피너 | AI 호출/저장 중 로딩 표시 |
| `zod` | 데이터 검증 | 모든 저장소 입출력 스키마 검증 |
| `jsonc-parser` | JSON 파싱 (comments 지원) | 설정 파일 (config.json) 파싱 |
| `dotenv` | 환경변수 로드 | `.env` 파일에서 API Key 로드 |
| `keytar` 또는 `node-keychain` | OS 키체인 저장 (Optional) | API Key 안전 저장 |
| `@Claude-ai/sdk` | Claude API | 공식 SDK |
| `openai` | OpenAI API | 공식 SDK |
| `@google/generative-ai` | Google Gemini API | 공식 SDK |
| `node-fetch` 또는 내장 `fetch` | HTTP (Node 18 내장 fetch) | Custom Provider, sunlight web 검색 |
| `semver` | 버전 관리 | 마이그레이션 |
| `uuid` | 고유 ID | Seed/Conversation/Branch ID |
| `lodash-es` 또는 구조분해 | 유틸리티 | 불필요한 코드 중복 방지 |

## 3.3 개발 도구 (Dev Dependencies)

| 도구 | 용도 |
|------|------|
| Vitest | 테스트 |
| ESLint + @typescript-eslint | 린팅 |
| Prettier | 포맷터 |
| tsx | 개발 시 스크립트 실행 |
| husky + lint-staged | pre-commit 린팅 |
| vitest-sonar-reporter (선택) | CI 테스트 리포트 |

## 3.4 TSConfig (핵심 옵션)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

# 4. Runtime Environment (런타임 환경)

## 4.1 지원 플랫폼

| 플랫폼 | 지원 여부 |
|--------|-----------|
| macOS (arm64, x64) | ✅ 1차 지원 |
| Windows (x64, arm64) | ✅ 1차 지원 |
| Linux (x64, arm64) | ✅ 1차 지원 |

## 4.2 Node.js 버전

- 권장: **Node.js 18 LTS 이상**
- 이유: 내장 `fetch`, ESM 지원, `--module nodenext` 호환

## 4.3 설치/실행

```bash
# 글로벌 설치 (OQ2: npm 패키지명)
npm install -g @seed-cli/seed

# npx (권장)
npx @seed-cli/seed

# 설치 불필요
```

> **OQ2 결정:** npm `seed` 패키지는 현재 점유 중으로 `@seed-cli/seed` 사용. CLI 바이너리 명은 여전히 `seed`.

## 4.4 의존성 설치 가능 없는 실행 (optional)
- Node.js 미설치 사용자 → **Node.js 18+ 미설치 시 안내 메시지** 출력 (설치 가이드 링크 포함)

---

# 5. Data Model (데이터 모델)

## 5.1 seed.json (Seed State)

가장 중요한 파일. Seed의 현재 상태.

```typescript
// Zod 스키마 예시
import { z } from 'zod';

export const SeedStatus = z.enum([
  'seedling',    // 초기 (0-20%)
  'growing',     // 성장 중 (21-40%)
  'branching',   // 가지 뻗는 중
  'pruning',     // 가지치기 중
  'evaluating',  // bloom 평가 중
  'blooming',    // 꽃피우는 중 (61-80%)
  'mature',      // 성숙 (81-100%)
  'harvested',   // 수확 완료
  'dormant',     // 휴면
]);

export const MaturityDimension = z.object({
  name: z.string(),           // 예: "problem"
  score: z.number().min(0).max(100),
  reason: z.string(),         // 점수 근거
});

export const SeedState = z.object({
  version: z.number(),               // 스키마 버전 (마이그레이션용)
  id: z.string().uuid(),
  name: z.string(),                  // Seed 이름 (사용자가 지정 또는 자동 생성)
  status: SeedStatus,
  maturity: z.number().min(0).max(100),
  maturityDimensions: z.array(MaturityDimension),
  originalIdea: z.string(),          // 첫 입력 그대로
  coreIdea: z.string(),             // 현재 요약
  problem: z.string().default(''),   // 요약에서 파생
  users: z.array(z.string()).default([]),
  goals: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  branches: z.array(z.string()),     // branch IDs
  activeBranch: z.string().optional(),
  prunedItems: z.array(z.string()).default([]),
  decisions: z.array(Decision),
  openQuestions: z.array(OpenQuestion),
  assumptions: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  parentSeedId: z.string().uuid().optional(),  // evolve 출처
});
```

## 5.2 Conversation (대화 기록)

```typescript
export const ConversationRole = z.enum(['user', 'assistant', 'system']);
export const ConversationType = z.enum(['question', 'answer', 'summary', 'insight', 'prune-suggestion']);

export const ConversationEntry = z.object({
  id: z.string().uuid(),
  seedId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  role: ConversationRole,
  type: ConversationType,
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
});
```

## 5.3 Branch (가지)

```typescript
export const BranchStatus = z.enum(['active', 'pruned', 'dormant', 'merged']);

export const Branch = z.object({
  id: z.string().uuid(),
  seedId: z.string().uuid(),
  name: z.string(),                  // 표시용 이름
  slug: z.string(),                  // 파일 시스템용
  summary: z.string(),               // branch 자체 요약
  direction: z.string(),             // "Repository Explorer" 등
  status: BranchStatus,
  maturity: z.number().min(0).max(100),
  parentBranchId: z.string().uuid().optional(),
  assumptions: z.array(z.string()).default([]),
  decisions: z.array(Decision),
  openQuestions: z.array(OpenQuestion),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

## 5.4 Decision (결정)

```typescript
export const Decision = z.object({
  id: z.string().uuid(),
  seedId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  decision: z.string(),
  reason: z.string(),
  source: z.string(),        // conversation ID
  confirmedByUser: z.boolean(),  // ★ 사용자 명시적 결정 vs AI 추론
  createdAt: z.string().datetime(),
});
```

## 5.5 OpenQuestion (미해결 질문)

```typescript
export const OpenQuestion = z.object({
  id: z.string().uuid(),
  seedId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  question: z.string(),
  importance: z.enum(['low', 'medium', 'high']),
  status: z.enum(['open', 'answered', 'cancelled']),
  answer: z.string().optional(),
  answeredAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
```

## 5.6 Research (Sunlight 리서치 기록)

```typescript
export const ResearchEntry = z.object({
  id: z.string().uuid(),
  seedId: z.string().uuid(),
  source: z.string(),       // URL 또는 출처
  title: z.string(),
  summary: z.string(),
  relevance: z.enum(['low', 'medium', 'high']),
  retrievedAt: z.string().datetime(),
  isVerified: z.boolean(),  // AI가 사실 여부 판단
  isEstimate: z.boolean(),  // 추정 여부
});
```

## 5.7 HarvestResult (수확 결과)

```typescript
export const HarvestType = z.enum(['idea', 'brief', 'prd', 'trd', 'readme', 'prompt']);

export const HarvestResult = z.object({
  id: z.string().uuid(),
  seedId: z.string().uuid(),
  type: HarvestType,
  version: z.number(),          // 같은 type多次 생성 시 버전
  content: z.string(),          // 마크다운 텍스트
  createdAt: z.string().datetime(),
  maturitySnapshot: z.number(), // 생성 시 성숙도
});
```

---

# 6. Application Structure (애플리케이션 구조)

## 6.1 프로젝트 트리

```text
seed/
├── src/
│   ├── cli/
│   │   ├── index.ts                    # CLI 엔트리 (Commander 설정)
│   │   ├── main.ts                     # 공통 인자 처리
│   │   └── commands/
│   │       ├── seed.ts                 # npx seed (plant)
│   │       ├── grow.ts                 # npx seed grow
│   │       ├── water.ts                # npx seed water
│   │       ├── branch.ts               # npx seed branch
│   │       ├── prune.ts                # npx seed prune
│   │       ├── sunlight.ts             # npx seed sunlight
│   │       ├── tree.ts                 # npx seed tree
│   │       ├── evolve.ts               # npx seed evolve
│   │       ├── bloom.ts                # npx seed bloom
│   │       ├── harvest.ts              # npx seed harvest (더보기: idea/prd/trd/readme/prompt)
│   │       ├── wither.ts               # npx seed wither
│   │       ├── wake.ts                 # npx seed wake
│   │       ├── garden.ts               # npx seed garden
│   │       ├── history.ts              # npx seed history
│   │       ├── config.ts               # npx seed config (★ Provider 설정)
│   │       └── restore.ts              # npx seed restore
│   │
│   ├── core/
│   │   ├── seed-manager.ts             # CRUD, 상태 머신, save/load
│   │   ├── growth-engine.ts            # grow/water 로직
│   │   ├── branch-engine.ts            # branch/prune/evolve/merge/restore
│   │   ├── maturity-engine.ts          # bloom 점수 산출
│   │   ├── harvest-engine.ts           # harvest 산출물 생성
│   │   ├── decision-tracker.ts         # 결정 저장/조회
│   │   └── research-engine.ts          # sunlight 리서치 (Phase 2)
│   │
│   ├── ai/
│   │   ├── context-builder.ts          # AI 호출 시 컨텍스트 조립
│   │   ├── provider-registry.ts        # 등록된 프로바이더 관리 (★)
│   │   ├── providers/
│   │   │   ├── base.ts                 # LLMProvider 인터페이스 정의
│   │   │   ├── openai-provider.ts      # OpenAI (API Key + OAuth)
│   │   │   ├── gemini-provider.ts      # Google Gemini
│   │   │   ├── Claude-provider.ts        # Claude (Claude)
│   │   │   ├── Claude-platform-provider.ts  # Claude (platform)
│   │   │   └── custom-provider.ts      # Custom (OpenAI-compatible)
│   │   ├── prompts/
│   │   │   ├── plant.ts
│   │   │   ├── grow-question.ts
│   │   │   ├── grow-update.ts
│   │   │   ├── branch-suggest.ts
│   │   │   ├── prune-suggest.ts
│   │   │   ├── sunlight-analyze.ts
│   │   │   ├── bloom-evaluate.ts
│   │   │   ├── harvest-prd.ts
│   │   │   ├── harvest-trd.ts
│   │   │   ├── harvest-readme.ts
│   │   │   ├── harvest-prompt.ts
│   │   │   └── evolve-suggest.ts
│   │   ├── parsers/
│   │   │   ├── json-extractor.ts       # AI 응답에서 JSON 추출 (```json ... ```)
│   │   │   └── structured-output.ts    # 형태소-level 파싱 + 검증
│   │   └── logger.ts                   # AI 호출/오류/비용 로그
│   │
│   ├── storage/
│   │   ├── seed-store.ts               # .seed/seed.json CRUD
│   │   ├── conversation-store.ts       # .seed/conversations/ CRUD
│   │   ├── branch-store.ts             # .seed/branches/ CRUD
│   │   ├── config-store.ts             # ~/.seed/config.json, .seed/config.json
│   │   ├── secure-key-store.ts         # API Key 저장 (OS 키체인/암호화)
│   │   ├── harvest-store.ts            # .seed/harvest/ CRUD
│   │   └── research-store.ts           # .seed/research/ CRUD
│   │
│   ├── harvest/
│   │   ├── idea.ts                     # Idea Card 생성 로직
│   │   ├── brief.ts                    # Brief 생성 로직
│   │   ├── prd.ts                      # PRD 생성 로직
│   │   ├── trd.ts                      # TRD 생성 로직
│   │   ├── readme.ts                   # README 생성 로직
│   │   └── prompt.ts                   # Coding Prompt 생성 로직
│   │
│   ├── ui/
│   │   ├── renderer.ts                 # 공통 출력 (색상, 이모지, 라인)
│   │   ├── prompts.ts                  # 인터랙티브 프롬프트 캡슐
│   │   ├── tree.ts                     # 트리 렌더링 (ASCII/유니코드)
│   │   ├── maturity-bar.ts             # 프로그레스 바 (██████░░)
│   │   ├── banner.ts                   # Welcome/Splash
│   │   └── spinner.ts                  # AI 호출 스피너 (ora 래퍼)
│   │
│   └── utils/
│       ├── id.ts                       # UUID 생성
│       ├── time.ts                     # 상대 시간, 포맷
│       ├── path.ts                     # .seed 경로 탐색 (CWD→ up to root)
│       ├── validate.ts                 # zod 파싱 + 에러 메시지
│       ├── git.ts                      # .gitignore 자동 추가 (seed 기록 제외)
│       └── env.ts                      # 환경변수 로드
│
├── tests/
│   ├── unit/
│   │   ├── seed-manager.test.ts
│   │   ├── growth-engine.test.ts
│   │   ├── branch-engine.test.ts
│   │   ├── maturity-engine.test.ts
│   │   ├── provider-registry.test.ts
│   │   ├── openai-provider.test.ts
│   │   ├── context-builder.test.ts
│   │   └── secure-key-store.test.ts
│   ├── integration/
│   │   ├── seed-flow.test.ts           # seed→grow→bloom 통합 테스트
│   │   ├── harvest-flow.test.ts
│   │   └── config-flow.test.ts
│   └── fixtures/
│       ├── mock-seed.json
│       └── mock-conversations/
│
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts                      # Vitest 설정
├── eslint.config.js
├── .prettierrc
├── husky/                              # pre-commit
├── README.md
├── PRD.md
└── TRD.md
```

---

# 7. Seed State Machine (상태 머신)

## 7.1 전체 상태 전이 다이어그램

```text
seedling ──(grow)──► growing ──(branch)──► branching
                         │                      │
                         ▼                      ▼
                    pruning ◄───── branch 생성 후
                         │
                         ▼
                    evaluating ──(bloom 확인)──► blooming
                                                        │
                                                        ▼
                                                   mature ──(harvest)──► harvested

─────────────────────────────────────────────────
어느 상태에서든 ──(wither)──► dormant
dormant ──(wake)──► (이전 상태로 복귀)
─────────────────────────────────────────────────
어느 상태에서든 ──(branch)──► branching
```

## 7.2 성숙도 단계 (Maturity Threshold)

| 성숙도 | 상태 | 기준 |
|--------|------|------|
| 0~20%  | 🌱 seedling | 초기 아이디어만 존재, 핵심 문제 미확인 |
| 21~40% | 🌿 growing | 문제와 핵심 사용자 윤곽, 방향 미정 |
| 41~60% | 🌳 developing | 핵심 가치 확인, 가지 제안 중 |
| 61~80% | 🌸 near bloom | 대부분 명확, scope/differentiation 검토 중 |
| 81~100% | 🌸 mature | 만들 준비 완료, harvest 가능 |

## 7.3 성숙도 계산 공식

maturity는 8개 차원의 평균 + 보정값:

```typescript
// maturity-engine.ts
function calculateMaturity(state: SeedState): number {
  const base = average(state.maturityDimensions.map(d => d.score));
  const penalty = calculateOpenQuestionPenalty(state.openQuestions);
  const bonus = calculateDecisionBonus(state.decisions);
  const clamped = clamp(base - penalty + bonus, 0, 100);
  return Math.round(clamped);
}

// Open Question이 high importance로 남아있으면 페널티
function calculateOpenQuestionPenalty(questions: OpenQuestion[]): number {
  const highOpen = questions.filter(q => q.importance === 'high' && q.status === 'open').length;
  return highOpen * 5;  // 하나당 5% 하락
}

// 사용자가 confirmed한 결정이 많으면 보너스
function calculateDecisionBonus(decisions: Decision[]): number {
  const confirmed = decisions.filter(d => d.confirmedByUser).length;
  return Math.min(confirmed * 2, 10);  // 최대 10% 보너스
}
```

---

# 8. AI Provider Architecture (AI 프로바이더 아키텍처)

> ★ PRD 6.13 (F-11)의 기술 구현

## 8.1 Provider 인터페이스 (Base Abstraction)

```typescript
// ai/providers/base.ts

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface ChatCompletionResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export interface LLMProviderConfig {
  id: string;                // 고유 식별자 ("openai", "gemini", "custom-1")
  name: string;              // 표시용 이름 ("OpenAI GPT-4o", "Gemini 1.5 Pro")
  type: 'openai' | 'gemini' | 'we64' | 'we64' | 'custom';  // OQ5: 'local'은 공식 미지원 (Custom Provider로만 사용)
  apiKey?: string;           // 암호화 저장소에서 읽음
  baseUrl?: string;          // OpenAI-compatible일 때
  defaultModel: string;
  models: ModelOption[];
  enabled: boolean;
  isActive: boolean;
  connectionMode?: 'api-key' | 'oauth';  // OpenAI만 OAuth 가능
  oauthTokens?: {           // OAuth 저장 시
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  };
  headers?: Record<string, string>;       // 커스텀 헤더
  extraConfig?: Record<string, unknown>;  // 벤더별 추가 설정
}

export interface ModelOption {
  id: string;                // "gpt-4o", "gemini-1.5-pro"
  displayName: string;
  contextWindow: number;     // 토큰
  maxOutputTokens: number;
  supportsJsonMode?: boolean;
  supportsVision?: boolean;
}

export interface LLMProvider {
  readonly id: string;
  readonly type: string;

  // 핵심 메서드
  chat(
    messages: ChatMessage[],
    options?: ChatCompletionOptions
  ): Promise<ChatCompletionResponse>;

  // 연결 테스트
  testConnection(): Promise<{ success: boolean; error?: string; latencyMs?: number }>;

  // 사용 가능한 모델 목록
  listModels(): Promise<ModelOption[]>;

  // 초기화/설정
  initialize(config: LLMProviderConfig): Promise<void>;
}
```

## 8.2 Provider Registry

```typescript
// ai/provider-registry.ts
export class ProviderRegistry {
  private providers: Map<string, LLMProvider> = new Map();
  private activeId: string | null = null;

  async register(config: LLMProviderConfig): Promise<void> { /* ... */ }
  async unregister(id: string): Promise<void> { /* ... */ }
  async setActive(id: string): Promise<void> { /* ... */ }
  getActive(): LLMProvider { /* ... */ }
  getById(id: string): LLMProvider | undefined { /* ... */ }
  listAll(): Array<{ id: string; name: string; isActive: boolean; enabled: boolean }> { /* ... */ }
  async testAll(): Promise<ProviderTestResult[]> { /* ... */ }
}
```

## 8.3 OpenAI Provider 상세

### 연결 방식 1: API Key (기본)
```typescript
// ai/providers/openai-provider.ts
export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;  // openai SDK

  async initialize(config: LLMProviderConfig): Promise<void> {
    const apiKey = await secureKeyStore.getKey(`openai:${config.id}`);
    this.client = new OpenAI({ apiKey, baseURL: config.baseUrl });
  }

  async chat(messages, options) {
    const response = await this.client.chat.completions.create({
      model: options?.model ?? config.defaultModel,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      response_format: options?.responseFormat === 'json'
        ? { type: 'json_object' }
        : undefined,
    });
    // ... 매핑
  }
}
```

### 연결 방식 2: OAuth 계정 연동 (OpenAI 전용)
```typescript
export async function openaiOAuthLogin(configId: string): Promise<OAuthResult> {
  // 1. 고유 auth code 생성
  const authCode = generateAuthCode();

  // 2. 사용자에게 브라우저 URL 안내
  const authUrl = `https://chatgpt.com/seed-cli/auth?code=${authCode}`;
  console.log(`🔗 OpenAI 계정에 연결하려면 다음 URL을 열어주세요:\n${authUrl}`);

  // 3. 로컬 HTTP 서버에서 callback 대기 (localhost:{port}/callback)
  const tokens = await waitForOAuthCallback(authCode, { port: 3847 });

  // 4. 토큰 안전 저장
  await secureKeyStore.setOAuthTokens(`openai:${configId}`, tokens);

  return { success: true, expiresAt: tokens.expiresAt };
}

// OAuth 토큰 만료 시 자동 갱신 로직
async function refreshOAuthToken(configId: string): Promise<void> {
  const tokens = await secureKeyStore.getOAuthTokens(`openai:${configId}`);
  if (isExpired(tokens.expiresAt)) {
    const newTokens = await openaiRefreshToken(tokens.refreshToken);
    await secureKeyStore.setOAuthTokens(`openai:${configId}`, newTokens);
  }
}
```

## 8.4 Gemini Provider

```typescript
export class GeminiProvider implements LLMProvider {
  private genAI: GoogleGenerativeAI;

  async initialize(config: LLMProviderConfig): Promise<void> {
    const apiKey = await secureKeyStore.getKey(`gemini:${config.id}`);
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async chat(messages, options) {
    const model = this.genAI.getGenerativeModel({
      model: options?.model ?? config.defaultModel,
    });
    // messages → Gemini 형식 변환 (user/model 분리)
    const result = await model.generateContent({ contents: geminiMessages });
    // ... 매핑
  }
}
```

## 8.5 Custom Provider (OpenAI-compatible)

```typescript
export class CustomProvider implements LLMProvider {
  async initialize(config: LLMProviderConfig): Promise<void> {
    // config.baseUrl + config.apiKey 사용
    // 모든 OpenAI-compatible 엔드포인트 지원
  }

  async chat(messages, options) {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...config.headers,  // 커스텀 헤더 (API 키 형식 차이 대응)
      },
      body: JSON.stringify({
        model: options?.model ?? config.defaultModel,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
      }),
    });
    // OpenAI format 응답을 통일 형식으로 변환
  }
}
```

## 8.6 설정 저장 구조

### 전역 설정 (`~/.seed/config.json`)
```json
{
  "version": 1,
  "activeProvider": "openai",
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI GPT-4o",
      "type": "openai",
      "connectionMode": "api-key",
      "defaultModel": "gpt-4o",
      "models": [
        { "id": "gpt-4o", "displayName": "GPT-4o", "contextWindow": 128000, "maxOutputTokens": 4096, "supportsJsonMode": true },
        { "id": "gpt-4o-mini", "displayName": "GPT-4o Mini", "contextWindow": 128000, "maxOutputTokens": 4096, "supportsJsonMode": true },
        { "id": "o3", "displayName": "o3", "contextWindow": 200000, "maxOutputTokens": 100000 }
      ],
      "enabled": true,
      "isActive": true
    },
    {
      "id": "gemini-1",
      "name": "Gemini 1.5 Pro",
      "type": "gemini",
      "connectionMode": "api-key",
      "defaultModel": "gemini-1.5-pro",
      "models": [
        { "id": "gemini-1.5-pro", "displayName": "Gemini 1.5 Pro", "contextWindow": 1048576, "maxOutputTokens": 8192 },
        { "id": "gemini-2.5-flash", "displayName": "Gemini 2.5 Flash", "contextWindow": 1048576, "maxOutputTokens": 8192 }
      ],
      "enabled": true,
      "isActive": false
    },
    {
      "id": "Claude-1",
      "name": "Claude (Claude)",
      "type": "Claude",
      "connectionMode": "api-key",
      "defaultModel": "Claude-sonnet-4-20250514",
      "models": [
        { "id": "Claude-sonnet-4-20250514", "displayName": "Claude Sonnet 4", "contextWindow": 200000, "maxOutputTokens": 8192 },
        { "id": "Claude-opus-4-20250514", "displayName": "Claude Opus 4", "contextWindow": 200000, "maxOutputTokens": 32000 }
      ],
      "enabled": true,
      "isActive": false
    },
    {
      "id": "openrouter-1",
      "name": "OpenRouter (Custom)",
      "type": "custom",
      "connectionMode": "api-key",
      "baseUrl": "https://openrouter.ai/api",
      "defaultModel": "meta-llama/llama-3-70b-instruct",
      "models": [
        { "id": "meta-llama/llama-3-70b-instruct", "displayName": "Llama 3 70B", "contextWindow": 8192, "maxOutputTokens": 4096 }
      ],
      "enabled": true,
      "isActive": false,
      "headers": { "HTTP-Referer": "https://seed-cli.com", "X-Title": "Seed CLI" }
    }
  ],
  "settings": {
    "defaultTemperature": 0.7,
    "maxTokensPerRequest": 4096,
    "autoRetry": true,
    "maxRetries": 2,
    "showTokenUsage": true,
    "telemetry": "off"
  }
}
```

### API Key 보안 전략

```
우선순위:
1. 환경변수 (예: SEED_OPENAI_API_KEY, OPENAI_API_KEY, SEED_GEMINI_API_KEY)
2. OS 키체인 (keytar / node-keychain)
3. 설정 파일 (AES-256 암호화, passphrase 기반 — 최후 수단)

설정 파일 평문 저장 금지 → gitignore 필수
```

### 프로젝트별 오버라이드 (`.seed/config.json`)
```json
{
  "activeProvider": "gemini-1",
  "overrides": {
    "defaultModel": "gemini-2.5-flash",
    "temperature": 0.5
  }
}
```

---

# 9. Context Builder (AI 컨텍스트 조립)

## 9.1 컨텍스트 구조

매 AI 호출 시, 전체 대화를 보내지 않고 **필요한 컨텍스트만 조립**한다.

```typescript
// ai/context-builder.ts
export interface AIContext {
  // 필수 (항상 포함)
  seedState: SeedState;
  coreIdea: string;
  importantDecisions: Decision[];       // confirmedByUser: true + 최근 결정
  openQuestions: OpenQuestion[];         // status: 'open' + importance 기준

  // 상황별 ( 필요 시 포함)
  recentConversation: ConversationEntry[];  // 최근 N개 (예: 10개)
  relevantHistory: GrowthEvent[];           // 전체 히스토리 요약
  currentBranch?: Branch;
  branchContext?: { decisions: Decision[]; openQuestions: OpenQuestion[] };
  sunlightResearch?: ResearchEntry[];       // sunlight 사용 시

  // 시스템 (시작 부분)
  systemPrompt: string;
}
```

## 9.2 컨텍스트 조립 알고리즘

```typescript
export async function buildContext(
  seedId: string,
  command: string,       // 'grow', 'bloom', 'harvest.prd' 등
  options?: BuildContextOptions
): Promise<AIContext> {

  const seedState = await seedStore.load(seedId);
  const decisions = await decisionTracker.getImportant(seedId);
  const openQuestions = await openQuestions.getOpen(seedId);
  const recentConversations = await conversationStore.getRecent(seedId, 10);

  // command별 전처리
  let systemPrompt: string;
  let includedData: Partial<AIContext> = {};

  switch(command) {
    case 'grow':
      systemPrompt = await loadPrompt('grow-question');
      includedData = {
        recentConversation: recentConversations,  // 대화 맥락
      };
      break;

    case 'bloom':
      systemPrompt = await loadPrompt('bloom-evaluate');
      includedData = {
        relevantHistory: await historyStore.getSummary(seedId),
      };
      break;

    case 'harvest.prd':
      systemPrompt = await loadPrompt('harvest-prd');
      includedData = {
        recentConversation: await conversationStore.getAll(seedId),
        relevantHistory: await historyStore.getAll(seedId),
        sunlightResearch: await researchStore.getAll(seedId),
      };
      break;
    // ... 나머지 명령어
  }

  return { seedState, coreIdea: seedState.coreIdea, decisions, openQuestions, ...includedData, systemPrompt };
}
```

## 9.3 토큰 예산 관리

```typescript
const CONTEXT_BUDGET: Record<string, number> = {
  'grow':          8000,    // grow는 최근 대화 중심
  'bloom':         6000,    // bloom은 상태 요약 중심
  'harvest.prd':  20000,    // harvest는 전체 데이터 필요 (버전 관리 대상)
  'sunlight':      6000,
};

function fitToBudget(context: AIContext, maxTokens: number): AIContext {
  // 1. systemPrompt + seedState + decisions: 항상 포함 (고정 비용 ~1500 토큰)
  // 2. recentConversation: 최근 N개 → 요약으로 압축
  // 3. openQuestions: 고 중요도 우선 포함
  // 4. 토큰 수 초과 시 가장 오래된 대화부터 요약으로 대체
}
```

---

# 10. State Management (상태 관리)

## 10.1 Seed 상태 로드/저장 (비동기, 파일 기반)

```typescript
// storage/seed-store.ts
export class SeedStore {
  private basePath: string;  // .seed/
  private backupPath: string; // .seed/.backup/

  async load(seedId: string): Promise<SeedState> { /* zod 검증 포함 */ }
  async save(seedState: SeedState): Promise<void> {
    // 1. 기존 파일을 .backup/으로 복사 (1개만 유지)
    // 2. 새 상태를 JSON.stringify으로 직렬화
    // 3. atomic write: .tmp에 쓰고 rename
    // 4. .gitignore에 *.json 추가 (선택, 사용자가 원할 때)
  }
  async findSeedInCurrentDir(): Promise<SeedState | null> { /* CWD에서向上 탐색 */ }
  async listAll(): Promise<SeedState[]> { /* garden용 */ }
  async delete(seedId: string): Promise<void> { /* wither에서 '완전 삭제' 사용 시 */ }
}
```

## 10.2 Conversation 저장

```typescript
// storage/conversation-store.ts
export class ConversationStore {
  async append(entry: Omit<ConversationEntry, 'id' | 'createdAt'>): Promise<ConversationEntry>;
  async getAll(seedId: string, branchId?: string): Promise<ConversationEntry[]>;
  async getRecent(seedId: string, limit: number): Promise<ConversationEntry[]>;
  async summarizeOlder(seedId: string, olderThanN: number): Promise<void> {
    // 오래된 대화를 AI로 요약 → summary 타입으로 저장
  }
}
```

## 10.3 Branch 저장

```typescript
// storage/branch-store.ts
export class BranchStore {
  async save(branch: Branch): Promise<void>;
  async load(branchId: string): Promise<Branch>;
  async listBySeed(seedId: string): Promise<Branch[]>;
  async updateStatus(branchId: string, status: BranchStatus): Promise<void>;
}
```

---

# 11. Storage (저장소)

## 11.1 `.seed/` 디렉터리 구조

```text
.seed/
├── seed.json                     # 현재(기본) Seed 상태
├── config.json                   # 프로젝트별 AI 설정 오버라이드
├── .backup/                      # 자동 백업 (최근 1개)
│   └── seed.json.bak
├── conversations/
│   ├── conv-{uuid-1}.json
│   ├── conv-{uuid-2}.json
│   └── ...
├── branches/
│   ├── {branch-id-1}.json
│   ├── {branch-id-2}.json
│   └── ...
├── decisions/
│   ├── dec-{uuid}.json
│   └── ...
├── research/                     # sunlight 리서치 결과
│   ├── {research-id}.json
│   └── ...
├── harvest/
│   ├── idea-v1.md
│   ├── idea-v2.md
│   ├── prd-v1.md
│   ├── prd-v2.md
│   ├── trd-v1.md
│   └── 2026-08-29/
│       ├── prd.md
│       └── trd.md
└── history/
    └── events.jsonl              # NDJSON (append-only 이벤트 로그)
```

## 11.2 `.gitignore` 자동 추가

seed가 `.seed/`를 생성하면 자동으로 프로젝트 `.gitignore`에 추가:

```text
# Seed - idea growth tool
.seed/
.seed/config.json
```

단, `seed.json` (상태)는 gitignore 여부를 사용자가 선택할 수 있다.

## 11.3 Atomic Write (무결성 보장)

```typescript
async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, data, 'utf-8');
  // Windows: rename 전 기존 파일 삭제 필요
  if (process.platform === 'win32') {
    await fs.rm(filePath, { force: true });
  }
  await fs.rename(tmpPath, filePath);
}
```

## 11.4 마이그레이션

```typescript
// storage/migrate.ts
const CURRENT_VERSION = 1;

export async function migrateSeed(state: SeedState): Promise<SeedState> {
  let current = state;
  while (current.version < CURRENT_VERSION) {
    current = migrations[current.version](current);
  }
  return current;
}
```

---

# 12. CLI Architecture (CLI 구조)

## 12.1 Commander.js 설정

```typescript
// cli/index.ts
import { Command } from 'commander';
import { version } from '../../package.json';

const program = new Command();

program
  .name('seed')
  .description('🌱 Plant an idea. Grow it. Build it.')
  .version(version)
  .argument('[idea]', 'Plant a new idea directly')
  .option('--json', 'JSON output for scripting')
  .option('--provider <id>', 'Override active AI provider')
  .option('--model <name>', 'Override AI model')
  .action(async (idea, options) => {
    await seedCommand(idea, options);
  });

program.command('grow')
  .description('Grow your idea through guided questions')
  .option('--branch <id>', 'Grow a specific branch')
  .option('--answer <text>', 'Non-interactive answer (for scripting)')
  .action(growCommand);

// ... 나머지 명령어

program.parse();
```

## 12.2 인터랙티브 모드 (REPL)

```typescript
// cli/interactive.ts
export async function startInteractiveMode(seedId: string): Promise<void> {
  const prompt = `${chalk.green('🌱 Seed >')}`;

  while (true) {
    const input = await readline.question(prompt);

    // / 명령어 처리
    if (input.startsWith('/')) {
      const cmd = input.slice(1);
      if (cmd === 'exit') break;
      if (cmd === 'help') { printHelp(); continue; }
      // /grow, /water, /branch 등 처리
    }

    // 자유 입력 → grow의 첫 번째 답변으로 처리
    await handleFreeInput(seedId, input);
  }
}
```

## 12.3 공통 옵션

| 플래그 | 설명 |
|--------|------|
| `--json` | 기계 판독 출력 (스크립트용) |
| `--provider <id>` | 해당 명령에만 특정 프로바이더 사용 |
| `--model <name>` | 해당 명령에만 특정 모델 사용 |
| `--branch <id>` | 특정 branch 대상 |
| `--no-interactive` | 인터랙티브 모드 비활성화 |
| `--verbose` | 상세 로그 출력 |
| `--dry-run` | 저장 없이 출력만 |

---

# 13. Configuration (설정)

## 13.1 설정 우선순위

```text
프로젝트 설정 (.seed/config.json)
  ▲ override
전역 설정 (~/.seed/config.json)
  ▲ override
환경변수 (SEED_*, OPENAI_API_KEY 등)
  ▲ override
OS 키체인 (API Key)
  ▲ override
기본값 (에러: 설정 필요 안내)
```

## 13.2 환경변수

| 변수 | 용도 |
|------|------|
| `SEED_CONFIG_PATH` | 전역 설정 경로 오버라이드 |
| `SEED_OPENAI_API_KEY` | OpenAI API Key |
| `OPENAI_API_KEY` | OpenAI API Key (fallback) |
| `SEED_GEMINI_API_KEY` | Gemini API Key |
| `SEED_Claude_API_KEY` | Claude API Key |
| `SEED_TELEMETRY` | `off` / `basic` / `full` |
| `SEED_NO_COLOR` | 색상 비활성화 |
| `SEED_HOME` | `~/.seed/` 오버라이드 |
| `DEBUG=seed:*` | 개발용 상세 로그 (NODE_DEBUG 대안) |

---

# 14. Error Handling (에러 처리)

## 14.1 에러 유형

```typescript
// core/errors.ts
export class SeedError extends Error {
  constructor(
    public code: string,     // "PROVIDER_NOT_CONFIGURED", "AI_PARSE_FAILED"
    message: string,
    public recoverable: boolean = true
  ) { super(message); }
}

export class ProviderError extends SeedError { /* API 호출 실패 */ }
export class ParseError extends SeedError { /* AI 응답 파싱 실패 */ }
export class StorageError extends SeedError { /* 파일 저장 실패 */ }
export class ValidationError extends SeedError { /* Zod 검증 실패 */ }
export class ConfigError extends SeedError { /* 설정 미완료 */ }
```

## 14.2 복구 전략

| 에러 | 복구 |
|------|------|
| API Key 없음 | `seed config` 마법사 안내 |
| API 호출 실패 (네트워크) | `--retry` 자동 재시도 (최대 2회), 로컬 기능(tree, history)은 계속 |
| API rate limit | 대기 후 재시도 + 명확한 메시지 |
| AI 응답 파싱 실패 | 재시도 후, 실패 시 자연어 응답 그대로 표시 + "형식을 맞추지 못했습니다" 안내 |
| `.seed/` 디렉터리 쓰기 실패 | 파일 권한 안내, `sudo` 사용 안내 |
| 프로바이더 미설정 | config 마법사로 안내 (첫 실행 시 자동) |
| JSON 스키마 검증 실패 | 마이그레이션 시도 → 실패 시 백업으로 롤백 |

## 14.3 AI 응답 파싱 (JSON extraction)

```typescript
// ai/parsers/json-extractor.ts
export function extractJSON<T>(response: string): T {
  // 1. ```json ... ``` 블록에서 추출 시도
  // 2. { ... } 또는 [ ... ] 으로 시작/끝 찾기
  // 3. JSON.parse 시도
  // 4. 실패 시 Zod 스키마로 검증 → 실패 시 재시도 (의사 결정 포함)
}
```

---

# 15. Security Considerations (보안)

## 15.1 API Key 관리

- **평문 저장 금지**: 환경변수 > OS 키체인 > 암호화된 설정 파일
- `.gitignore` 필수: `*.json`, `*.bak` 파일
- `seed config show` 시 마스킹 표시: `sk-***...xyz`
- OAuth 토큰은 만료 시 자동 갱신 시도, 갱신 실패 시 명확한 재인증 안내

## 15.2 입력 검증

- 모든 사용자 입력은 Zod 스키마 검증 후 저장
- AI 출력도 Zod 검증 후 신뢰 (ParseError 발생 시 재시도)

## 15.3 파일 시스템

- `.seed/` 내부에만 쓰기 (사용자 프로젝트 파일 건드리지 않음)
- `harvest/` 결과물만 사용자 프로젝트 디렉터리에 생성 (사용자 명시적 확인 후)
- Atomic write로 깨진 파일 방지

## 15.4 네트워크

- 모든 API 호출은 HTTPS 필수
- Custom Provider 사용 시 사용자가 URL을 직접 지정 (검증 불가, 경고 문구 표시)

---

# 16. Performance Considerations (성능)

## 16.1 응답 시간 목표

| 작업 | 목표 |
|------|------|
| `tree` / `garden` / `history` (로컬) | < 200ms |
| `grow` (AI 호출 포함) | < 8s (1차 응답) |
| `bloom` (AI 평가) | < 5s |
| `harvest prd` (대량 생성) | < 15s |
| `config list` | < 100ms |

## 16.2 최적화

- 대화 압축: 장기 대화는 요약으로 변환 (컨텍스트 토큰 절약)
- 지연 로딩: tree.render()는 선택 시에만 전체 구조 로드
- 캐시: 최근 호출 결과를 메모리에 30초 유지 (동일 명령 반복 시)

---

# 17. Testing Strategy (테스트 전략)

## 17.1 테스트 단계

| 단계 | 내용 | 도구 |
|------|------|------|
| 단위 테스트 | 각 엔진 로직 (growth, branch, maturity, harvest) | Vitest |
| 통합 테스트 | Seed 전체 흐름 (plant→grow→bloom→harvest) | Vitest + fixtures |
| 스모크 테스트 | `npx seed --help`, config, tree (CLI 동작) | Vitest + child_process |
| 수동 테스트 | 인터랙티브 모드, TUI 출력, 색상 | 개발자 수동 |
| E2E 테스트 | 전체 터미널 시나리오 (scripted) | Vitest + expect.stringContaining |

## 17.2 테스트 커버리지 목표

- 핵심 엔진(growth, branch, maturity, harvest): **≥ 90%**
- AI Provider abstraction: **≥ 85%**
- CLI command handlers: **≥ 75%**
- UI/Renderer: 수동 테스트 위주 (스냅샷 테스트 포함)

## 17.3 Mocking

- AI Provider: 테스트 시 `MockProvider` (응답 고정) 사용
- 파일 시스템: `memfs` 또는 `fs mocking` (vitest 내장)
- 네트워크: MSW 또는 직접 mocking

## 17.4 CI/CD (GitHub Actions 예시)

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: [18, 20]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node-version }} }
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --coverage
      - run: npm run build
```

---

# 18. Deployment (배포)

## 18.1 npm 배포

```json
// package.json 핵심
{
  "name": "@seed-cli/seed",   // OQ2: 'seed'는 점유 중이라 스코프 패키지 사용
  "version": "0.1.0",
  "license": "MIT",           // OQ3: 무료 오픈소스 (MIT 또는 Apache 2.0, 결정 후 확정)
  "funding": {                // OQ3: 후원 링크
    "type": "github",
    "url": "https://github.com/sponsors/seed-cli"
  },
  "bin": {
    "seed": "./dist/cli/index.js"   // 바이너리 명은 여전히 'seed'
  },
  "type": "module",
  "main": "./dist/cli/index.js",
  "files": ["dist/", "README.md", "LICENSE"],
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "prepublishOnly": "npm run build"
  }
}
```

## 18.2 릴리스 절차

```bash
# 버전 업데이트
npm version patch/minor/major

# 빌드 & 테스트
npm run build && npm test

# npm에 게시
npm publish --access public
```

## 18.3 버저닝 전략

- `0.x.y` : MVP 비공식 릴리스
- `1.0.0` : 공식 첫 릴리스
- SemVer 엄수: breaking change → major, 기능 추가 → minor, 버그 수정 → patch

---

# 19. Observability (관찰 가능성)

## 19.1 로깅

| 레벨 | 용도 |
|------|------|
| `debug` | AI 호출 파라미터/응답, 파일 저장 상세 |
| `info` | 명령어 실행 완료, 상태 변경 |
| `warn` | 재시도, 프로바이더 폴백 |
| `error` | API 실패, 파싱 실패, 저장 실패 |

설정: `DEBUG=seed:*` 환경변수로 상세 로그 활성화.

## 19.2 토큰/비용 추적 (Phase 2)

- 각 AI 호출 시 `usage` 필드를 `history/events.jsonl`에 기록
- `npx seed config bench`로 프로바이더별 비용/속도 비교
- `seed.json`에 `estimatedCost` 필드 (선택)

## 19.3 오류 로그

- `~/.seed/error.log`에 에러만 기록 (최대 1MB, 자동 로테이션)
- `seed config debug`로 로그 위치 안내

---

# 20. Technical Risks (기술 리스크)

| # | 리스크 | 확률 | 영향 | 완화 |
|---|--------|------|------|------|
| TR1 | OpenAI/OAuth 토큰 관리 복잡성 | 중간 | 높음 | 최소한 API Key 모드 먼저 안정화, OAuth는 보조 |
| TR2 | Custom Provider 형식 불일치 (OpenAI-compatible ≠ 전부) | 높음 | 중간 | 헤더/포맷 설정 커스터마이징, 문서화 |
| TR3 | AI 파싱 실패 빈도 | 중간 | 높음 | 재시도 + structured output(JSON mode) 우선 사용 |
| TR4 | Windows 경로 이슈 (`/` vs `\`) | 중간 | 낮음 | path.join 사용, 테스트 커버 |
| TR5 | Node.js ESM 전환 혼란 | 중간 | 낮음 | 명확한 tsconfig + `.mjs` 엔트리 |
| TR6 | `.seed/` 디렉터리 매우 커짐 (대화 다수 시) | 낮음 | 중간 | 대화 요약, 오래된 것은 아카이브 |
| TR7 | npm `seed` 패키지명 점유 불가 | 중간 | 중간 | `@seed-cli/seed` 대안 준비 |

---

# 21. Future Scalability (미래 확장성)

## 21.1 설계 확장 지점

| 지점 | 확장 방향 |
|------|-----------|
| `LLMProvider` 인터페이스 | 새 프로바이더(We64, 맞춤형) 추가 시 구현만 추가 (OQ5: Ollama/Local은 공식 미지원) |
| `HarvestType` 열거형 | 새 산출물(비즈니스 플랜, 기획서 등) 추가 시 enum 확장 |
| `ContextBuilder` | 전체 → 부분 압축 전략, 멀티모달(이미지) 확장 대비 |
| `SeedStore` | JSON → SQLite → Cloud 저장소 전환 인터페이스 |
| `Branch` 모델 | merge 기능 추가 시 연결 관계만 확장 |
| 이벤트 로그(JSONL) | 분석·리포트·대시보드 기반 데이터 |

## 21.2 Phase별 확장 로드맵

| Phase | 기능 | 기술 확장 |
|-------|------|-----------|
| Phase 1 (MVP) | seed/grow/branch/prune/bloom/tree/history/harvest | JSON 저장, 멀티 프로바이더, CLI REPL |
| Phase 2 | water/sunlight/evolve/wither/wake/garden/restore/merge | SQLite 저장, web 검색 통합, 토큰/비용 표시 |
| Phase 3 | Web UI, Visual Tree, Cloud Sync, Collaboration | REST API 서버, DB 전환, 인증, 실시간 동기화 |

---

# 22. 구현 우선순위 (Implementation Priority)

Seed.md #65 기준 + 기술 의존성 반영:

```
우선순위 1 (Phase 1 — MVP 필수):
  ────────────────────────────────
  [1]  Zod 스키마 정의 (5장 데이터 모델)
  [2]  Storage layer (seed-store, conversation-store, branch-store)
  [3]  Provider abstraction + OpenAI Provider + config store
  [4]  CLI framework + seed 명령어 (plant)
  [5]  Context Builder
  [6]  Growth Engine (grow)
  [7]  Branch Engine (branch)
  [8]  Branch Engine (prune)
  [9]  Maturity Engine (bloom)
  [10] Tree renderer
  [11] History (event log)
  [12] Harvest Engine (idea, prd, trd)
  [13] TUI (chalk, ora, prompts)
  [14] i18n 패키지 (영어 + 한국어, §25 참조)

우선순위 2 (Phase 2):
  ─────────────────────
  [14] water
  [15] sunlight (+ web search)
  [16] evolve
  [17] wither / wake
  [18] garden
  [19] restore
  [20] harvest readme / prompt
  [21] 멀티 프로바이더 벤치마크
  [22] SQLite 저장소 전환 (선택)

우선순위 3 (Phase 3):
  ─────────────────────
  [23] Web UI / Dashboard
  [24] Visual Tree
  [25] Cloud Sync
  [26] Collaboration
  [27] AI Personas
```

---

# 23. 파일 구조 요약 (Key Files)

| 파일 | 역할 | 핵심 구현 |
|------|------|-----------|
| `src/cli/index.ts` | CLI 엔트리 | Commander 설정, 공통 옵션 |
| `src/core/seed-manager.ts` | Seed CRUD + 상태 머신 | save/load/update/transition |
| `src/core/growth-engine.ts` | grow/water 로직 | AI 호출 → 상태 갱신 |
| `src/core/branch-engine.ts` | branch/prune/evolve/restore | 가지 관리 |
| `src/core/maturity-engine.ts` | bloom 점수 산출 | 8차원 계산 + penalty/bonus |
| `src/ai/provider-registry.ts` | 프로바이더 등록/관리 | 멀티 프로바이더 오케스트레이션 |
| `src/ai/providers/base.ts` | LLMProvider 인터페이스 | 핵심 추상화 |
| `src/ai/providers/openai-provider.ts` | OpenAI API Key + OAuth | OpenAI 전용 |
| `src/ai/providers/gemini-provider.ts` | Google Gemini API | Gemini 전용 |
| `src/ai/providers/custom-provider.ts` | OpenAI-compatible 커스텀 | 범용 프로바이더 |
| `src/ai/context-builder.ts` | AI 호출 컨텍스트 조립 | 토큰 예산 관리 |
| `src/ai/prompts/*.ts` | 시스템 프롬프트 모음 | 명령어별 전문 프롬프트 |
| `src/ai/parsers/json-extractor.ts` | AI 응답 JSON 추출 | 재시도 포함 |
| `src/storage/secure-key-store.ts` | API Key 저장 | OS 키체인/암호화 |
| `src/storage/config-store.ts` | 설정 저장/로드 | 전역/프로젝트 오버라이드 |
| `src/ui/renderer.ts` | 공통 출력 | 색상/이모지 렌더링 |
| `src/ui/tree.ts` | 트리 렌더링 | ASCII + 유니코드 |

---

# 24. 참고: AI 프롬프트 설계 원칙 (Prompts)

## 24.1 시스템 프롬프트 공통 원칙

모든 시스템 프롬프트에 포함:

```text
You are Seed's Gardener — an AI that helps developers grow their ideas.

Core rules:
1. Never decide for the user. Propose, then confirm.
2. One question at a time. Never ask too much in a single turn.
3. Detect contradictions and call them out politely.
4. If the idea is growing too large, suggest pruning.
5. Your output MUST be valid JSON matching the provided schema.
6. Never invent facts. Use TBD for unknowns.
7. Your tone: a gardener nurturing a seed — thoughtful, not cheerleading.
```

## 24.2 응답 스키마 (예시: grow.question)

```json
{
  "updatedSummary": "string",
  "question": "string",
  "questionReason": "string",
  "contradictionsDetected": ["string"],
  "suggestions": ["string"],
  "maturityDelta": "number (e.g., +2)"
}
```

---

---

# 25. i18n (다국어 지원) ★ 사용자 추가 요구사항 (OQ6)

> **OQ6 결정:** 영어(기본) + 한국어 지원. UI 문구는 언어 팩, AI 콘텐츠는 언어 무관. PRD §6.19 (F-17) 참조.

## 25.1 언어 팩 구조

```text
src/i18n/
├── index.ts            # t() 함수, 로더, 폴백
├── types.ts            # TranslationKey 타입 (자동 생성/수동 유지)
├── en.json             # 영어 팩 (기본)
└── ko.json             # 한국어 팩
```

### 타입 안전한 키 구조

```typescript
// src/i18n/types.ts
export interface TranslationSchema {
  'welcome.title': string;
  'welcome.subtitle': string;
  'welcome.prompt': string;
  'plant.created': string;
  'growth.update': { before: string; after: string };
  'bloom.overall': { score: number };
  'error.providerNotConfigured': string;
  'error.retryLimit': { attempt: number };
  // ... 모든 UI 문자열 키
}

export type TranslationKey = keyof TranslationSchema;

// src/i18n/index.ts
import en from './en.json';
import ko from './ko.json';

export type Language = 'en' | 'ko';
const catalogs: Record<Language, TranslationSchema> = { en, ko };

// 변수 치환 지원 — {name} 패턴
export function t(key: string, vars?: Record<string, string | number>, lang?: Language): string {
  const catalog = catalogs[resolveLang(lang)];
  let template = catalog[key] ?? catalogs.en[key] ?? key;  // 폴백: ko → en → 키 이름
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return template;
}
```

## 25.2 언어 결정 우선순위

```typescript
// src/i18n/index.ts
export function resolveLang(explicit?: Language): Language {
  // 1. 명령행 플래그 --lang ko (최우선)
  if (explicit) return explicit;
  // 2. 환경변수 SEED_LANG
  const env = process.env.SEED_LANG;
  if (env === 'ko') return 'ko';
  // 3. 설정 파일 lang (전역/프로젝트)
  const configLang = configStore.get('lang');
  if (configLang === 'ko') return 'ko';
  // 4. 시스템 로케일 (LANG/LC_ALL 감지 — ko* 포함 시 ko)
  const sys = process.env.LANG ?? process.env.LC_ALL ?? '';
  if (/^ko/i.test(sys)) return 'ko';
  // 5. 기본값 en
  return 'en';
}
```

## 25.3 적용 대상 (코드 규칙)

| 대상 | i18n 적용 | 비고 |
|------|-----------|------|
| 배너/인사말/고정 메시지 | ✅ `t('...')` 필수 | renderer/prompts 전부 |
| 명령어 설명 (`.description()`) | ✅ | help 출력 |
| 에러 메시지 | ✅ | SeedError code 기반 t() |
| 인터랙티브 선택지/메뉴 | ✅ | |
| AI 시스템 프롬프트 | ❌ (영문 고정) | 모델이 사용자 언어로 답변 |
| AI 질문/요약 콘텐츠 | ❌ (언어 무관) | 사용자 입력 언어 따라감 |
| Harvest 문서 (PRD/TRD) | ✅ 선택적 | `harvest prd --lang ko` 시 한글 구조 템플릿 |

## 25.4 Harvest 문서 언어 제어

```typescript
// prd.ts 에서
const docLang = await resolveLang(cliOptions.lang);   // harvest 명령의 --lang
// PRD 구조 템플릿(섹션 제목 등)을 해당 언어로 렌더링
// 단, 내용(AI 생성)은 사용자 결정/입력 언어 따라감
```

## 25.5 수락 기준 (AC) — 기술

- [ ] AC-TR-i18n-1: `SEED_LANG=ko` + `npx seed` 시 모든 고정 문구가 한국어
- [ ] AC-TR-i18n-2: 플래그 無 + 시스템 `ko` 로케일 → 한국어 자동 감지
- [ ] AC-TR-i18n-3: 누락 키는 영어 → 키 이름 순으로 폴백
- [ ] AC-TR-i18n-4: `--help` 전체가 선택 언어로 출력
- [ ] AC-TR-i18n-5: 모든 UI 문자열이 `t()` 경유 (하드코딩 금지 — lint 규칙으로 강제)

## 25.6 추가 언어 확장 (Phase 2+)

- 언어 팩 파일만 추가하면 동작 (`ja.json`, `zh.json` 등)
- 커뮤니티 기여 워크플로: 언어 팩 + 번역 리뷰 가이드 문서화
- `seed config set lang ja` 로 즉시 전환

---

> **문서 작성 완료.**
>
> PRD + TRD에 포함된 핵심 내용:
> - Seed.md의 모든 기능에 대한 구조화된 요구사항
> - AI 프로바이더 상세 설정 (OpenAI 계정연동/OAuth + API, Gemini API, We64 API, Custom Provider)
> - 타입 시스템, 저장 구조, 컨텍스트 아키텍처
> - 테스트, 배포, 에러 처리, 보안 전략
> - **OQ1~7 결정 반영** (텔레메트리 off, @seed-cli/seed, 무료+후원, npm 우선, 로컬 미지원, 다국어 en/ko, OpenAI Device Flow)
> - i18n 다국어 아키텍처 (§25)
> - Phase 1~3 릴리스 로드맵
---

# 25. i18n (다국어 지원) ★ 사용자 추가 요구사항 (OQ6)

> **OQ6 결정:** 영어(기본) + 한국어 지원. UI 문구는 언어 팩, AI 콘텐츠는 언어 무관. PRD §6.19 (F-17) 참조.

## 25.1 언어 팩 구조



### 타입 안전한 키 구조

{}

## 25.2 언어 결정 우선순위



## 25.3 적용 대상 (코드 규칙)

| 대상 | i18n 적용 | 비고 |
|------|-----------|------|
| 배너/인사말/고정 메시지 | ✅  필수 | renderer/prompts 전부 |
| 명령어 설명 () | ✅ | help 출력 |
| 에러 메시지 | ✅ | SeedError code 기반 t() |
| 인터랙티브 선택지/메뉴 | ✅ | |
| AI 시스템 프롬프트 | ❌ (영문 고정) | 모델이 사용자 언어로 답변 |
| AI 질문/요약 콘텐츠 | ❌ (언어 무관) | 사용자 입력 언어 따라감 |
| Harvest 문서 (PRD/TRD) | ✅ 선택적 |  시 한글 구조 템플릿 |

## 25.4 Harvest 문서 언어 제어



## 25.5 수락 기준 (AC) — 기술

- [ ] AC-TR-i18n-1:  +  시 모든 고정 문구가 한국어
- [ ] AC-TR-i18n-2: 플래그 無 + 시스템  로케일 → 한국어 자동 감지
- [ ] AC-TR-i18n-3: 누락 키는 영어 → 키 이름 순으로 폴백
- [ ] AC-TR-i18n-4:  전체가 선택 언어로 출력
- [ ] AC-TR-i18n-5: 모든 UI 문자열이  경유 (하드코딩 금지 — lint 규칙으로 강제)

## 25.6 추가 언어 확장 (Phase 2+)

- 언어 팩 파일만 추가하면 동작 (,  등)
- 커뮤니티 기여 워크플로: 언어 팩 + 번역 리뷰 가이드 문서화
-  로 즉시 전환