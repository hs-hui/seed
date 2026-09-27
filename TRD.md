# 🌱 SEED — Technical Requirements Document (TRD)

> **Architecture, data model, and implementation blueprint for the Seed CLI.**
>
> 버전: v1.93 (작성일: 2026-08-30)
> 기반: Seed.md v1 + PRD.md v1.93
> 상태: Draft

---

# 0. 문서 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| v0.1 | 2026-08-29 | Tech | Seed.md 기반 1차 초안 |
| v1.0 | 2026-08-29 | Tech | AI Provider 아키텍처 상세, config/f-11 반영, 스키마 확정 |
| v1.2 | 2026-08-30 | Tech | OpenAI 계정 인증을 실제 `openai-oauth` 로컬 브라우저/loopback callback 구현으로 정렬 |
| v1.3 | 2026-08-30 | Tech | OpenAI 기본 모델을 `gpt-5.6-luna`로 통일 |
| v1.4 | 2026-08-30 | Tech | 성장 컨텍스트 확장, 질문 제어 상태, provider별 대화 role 정규화 반영 |
| v1.5 | 2026-08-30 | Tech | 비개발자용 질문 가이드와 `GROW_INPUT_CLASSIFY` 의도 분류 반영 |
| v1.6 | 2026-08-30 | Tech | 다국어 help 제목, provider 실패 fallback, 설정 비밀값 정리 반영 |
| v1.7 | 2026-08-30 | Tech | 로컬 의도 판정 보강과 질문·요약·관점 결과의 초보자용 출력 가드 반영 |
| v1.8 | 2026-08-30 | Tech | Commander JSON 오류 출력과 비활성 branch 성장 차단 반영 |
| v1.9 | 2026-08-30 | Tech | 질문 길이·복합도 가드와 sunlight/bloom AI 결과 정규화 반영 |
| v1.10 | 2026-08-30 | Tech | 비활성 branch 보호와 parser JSON 오류 경로 정리 반영 |
| v1.11 | 2026-08-30 | Tech | 자연어 도움 요청 안전망 확장, 분류 응답 오류 시 로컬 판정 재사용, 초보자용 질문 회귀 테스트 추가 |
| v1.12 | 2026-08-30 | Tech | Seed/branch/conversation/event 저장·로드에 Zod 스키마 검증을 적용하고 손상 파일은 격리 |
| v1.13 | 2026-08-30 | Tech | wake 입력을 공통 의도 분류 경로에 연결하고, OAuth 성공 시 provider 활성화 상태를 보장 |
| v1.14 | 2026-08-30 | Tech | atomicWrite 임시 파일명을 UUID 기반으로 분리해 겹치는 쓰기의 상태 오염을 방지 |
| v1.15 | 2026-08-30 | Tech | 동일 경로 atomicWrite 큐를 도입해 Windows rename 경쟁 조건을 제거하고 동시성 회귀 테스트 추가 |
| v1.16 | 2026-08-30 | Tech | wake 입력을 공통 분류기에 연결하고 알 수 없는 provider 삭제를 실패 처리 |
| v1.17 | 2026-08-30 | Tech | wither/wake 최신 상태 재로드, branch ID 대소문자 정규화, lifecycle/복구 회귀 테스트 추가 |
| v1.18 | 2026-08-30 | Tech | 자연어 도움 요청 안전망·모델 오판 보호, JSONL append 직렬화, 중첩 garden 탐색, 다국어 수확 선택지 반영 |
| v1.19 | 2026-08-30 | Tech | 짧은 yes/no 답변의 결정적 보존과 아이디어 내용의 질문 변경 오탐 방지 회귀 테스트 반영 |
| v1.20 | 2026-08-30 | Tech | 로컬·코어 성장 경로가 공유하는 보수적 입력 의도 판정 모듈과 오탐 회귀 케이스 추가 |
| v1.21 | 2026-08-30 | Tech | README 수확 섹션 검증과 다국어 초보자용 출력 경계를 반영 |
| v1.22 | 2026-08-30 | Tech | 질문 변경 요청을 `preferSimpleQuestion` 컨텍스트로 전달해 다음 AI 질문을 구체적·초보자용으로 제한 |
| v1.23 | 2026-08-30 | Tech | 자연어 pause 안전망과 JSON/Tty 출력 경계를 보강하고 OAuth 진행 메시지를 stderr로 분리 |
| v1.24 | 2026-08-30 | Tech | pause 정규식의 문장 경계를 보수화하고 활성 가지가 모두 잘린 경우 루트로 복귀 |
| v1.25 | 2026-08-30 | Tech | 설정 마법사가 공통 프로바이더 키 해석기를 사용하고 자연어 제어 입력 경계를 확장 |
| v1.26 | 2026-08-30 | Tech | AI 관련 정상 문장과 실제 도움 요청을 구분하는 회귀 검증을 추가 |
| v1.27 | 2026-08-30 | Tech | 답변 문장의 pause 오탐을 줄이고 자연어 혼란·보류 표현 회귀 테스트를 확장 |
| v1.28 | 2026-08-30 | Tech | `saveResearch`에 ResearchEntry 스키마 검증을 적용하고 손상 입력 테스트를 추가 |
| v1.29 | 2026-08-30 | Tech | 짧은 `이거 어려워`·`This is hard`·`I'm stuck` 표현의 보수적 질문 변경 판정과 회귀 테스트 반영 |
| v1.30 | 2026-08-30 | Tech | Garden 선택 진입을 위한 root override·중첩 REPL 복구와 번호/이름/ID/경로 선택 경계 반영 |
| v1.31 | 2026-08-30 | Tech | 어려움·막힘·AI 판단 요청 혼합 입력의 결정론적 안전망과 회귀 케이스 보강 |
| v1.32 | 2026-08-30 | Tech | 주어가 붙은 짧은 어려움 표현의 오프라인 판정 회귀 케이스 추가 |
| v1.33 | 2026-08-30 | Tech | `saveProjectConfig`와 CLI 설정 저장 경로를 추가하고 프로젝트 오버라이드 회귀 테스트 반영 |
| v1.34 | 2026-08-30 | Tech | 비정상 `lang` 설정을 정규화해 runtime·config 출력 경계를 일치시킴 |
| v1.35 | 2026-08-30 | Tech | 공통 입력 의도 모듈로 분류 경로를 단일화하고 README 수확 템플릿을 실제 MIT 표기로 정리 |
| v1.36 | 2026-08-30 | Tech | 초보자의 다양한 어려움·막힘 표현을 신호 조합으로 판정하고 정상적인 제품 설명 오탐을 방지 |
| v1.37 | 2026-08-30 | Tech | 보류와 질문 변경이 섞인 자연어를 공통 판정기로 구분하고 모든 수확 기록의 저장 무결성을 보장 |
| v1.38 | 2026-08-30 | Tech | 보류 접두어가 붙은 질문 변경 요청과 짧은 자연어 요청을 안전하게 구분 |
| v1.39 | 2026-08-30 | Tech | 추임새가 붙은 예시·쉬운 질문 요청과 정상적인 사용자 요구 문장을 구분 |
| v1.40 | 2026-08-30 | Tech | 수확 메뉴 제목을 공통 다국어 카탈로그로 통합 |
| v1.41 | 2026-08-30 | Tech | 선택 기능의 로컬 질문도 비개발자가 바로 답할 수 있는 일상어로 통일 |
| v1.42 | 2026-08-30 | Tech | 답변하기 어렵다는 자연어와 추임새가 섞인 도움 요청을 안전하게 처리 |
| v1.43 | 2026-08-30 | Tech | 선택 기능의 AI 출력에서도 기술 용어가 초보자에게 노출되지 않도록 필터 강화 |
| v1.44 | 2026-08-30 | Tech | 짧은 건너뛰기·다른 질문 자연어 안전망과 선택 전 상태 변경 방지 경계 추가 |
| v1.45 | 2026-08-30 | Tech | LocalProvider의 water/sunlight fallback에서도 기술 용어가 노출되지 않도록 출력 경계 통일 |
| v1.46 | 2026-08-30 | Tech | JSON 오류 출력 채널을 stdout으로 통일하고 로고만 stderr에 유지 |
| v1.47 | 2026-08-30 | Tech | 제3자·제품 설명 문장을 입력 의도 안전망에서 보존하고 도움 요청 오탐 회귀 케이스 추가 |
| v1.48 | 2026-08-30 | Tech | branch/prune 도메인 입력을 저장 전 검증하고 빈 값 회귀 테스트 추가 |
| v1.49 | 2026-08-30 | Tech | SeedStore.load가 동일 Zod 스키마로 rolling backup을 검증한 뒤 손상 상태를 복구하도록 구현 |
| v1.50 | 2026-08-30 | Tech | OAuth 브라우저 URL·인증 저장 진행 메시지를 공통 i18n 카탈로그로 이동 |
| v1.51 | 2026-08-30 | Tech | 새 `SEED_HOME` 격리 TTY에서 first-run wizard와 초기 질문 연결을 검증 |
| v1.52 | 2026-08-30 | Tech | `SeedStore.hasSeed`가 유효한 rolling backup도 확인해 복구 가능한 상태의 덮어쓰기를 차단 |
| v1.53 | 2026-08-30 | Tech | first-run setup에서 명시된 잘못된 언어를 영어로 정규화하고 TTY 흐름을 검증 |
| v1.54 | 2026-08-30 | Tech | Custom provider 설정의 Base URL·모델 필수 입력 경계를 CLI 오류 코드로 추가 |
| v1.55 | 2026-08-30 | Tech | interactiveGrowthSession·wake 입력에 명시적 세션 종료 경로와 중첩 REPL 전파 플래그 추가 |
| v1.56 | 2026-08-30 | Tech | 성장 종료 제어와 빈 입력 일시정지의 사용자 동작을 README와 구현 계약에 동기화 |
| v1.57 | 2026-08-30 | Tech | `findSeedRoot`·Garden 탐색이 검증 가능한 seed backup marker와 백업 상태를 지원 |
| v1.58 | 2026-08-30 | Tech | 기술적 실현성 표현을 초보자 용어 필터와 회귀 테스트에 포함 |
| v1.59 | 2026-08-30 | Tech | 문서 머리말이 현재 PRD v1.59에서 최신 이력으로 참조되도록 정리 |
| v1.60 | 2026-08-30 | Tech | 모델과 로컬 대체 응답이 모두 깨져도 필수 초점별 안전 질문을 반환하도록 보강 |
| v1.61 | 2026-08-30 | Tech | API·백엔드·배포 등 초보자에게 어려운 용어를 질문 출력 가드에 추가 |
| v1.62 | 2026-08-30 | Tech | 한국어 질문의 표시 문자 수까지 검사해 fallback 출력 길이 경계를 보장 |
| v1.63 | 2026-08-30 | Tech | 연결 테스트 전에는 비활성 프로바이더 프로필을 저장하지 않고 로컬 fallback만 유지 |
| v1.64 | 2026-08-30 | Tech | 혼란·이해 부족 자연어 신호 조합과 제품 설명 보호 패턴을 확장 |
| v1.65 | 2026-08-30 | Tech | 성장 프롬프트의 시작/후속 라벨을 prompt 횟수 기준으로 결정 |
| v1.66 | 2026-08-30 | Tech | history 이벤트를 createdAt 기준으로 정렬해 동시 실행에서도 시간순을 보장 |
| v1.67 | 2026-08-30 | Tech | Custom Provider wizard의 빈 모델 입력을 local fallback으로 되돌리고 프로필을 저장하지 않음 |
| v1.68 | 2026-08-30 | Tech | bounded AI context와 별도로 전체 질문 이력 중복 검사를 유지 |
| v1.69 | 2026-08-30 | Tech | 초점별 안전 질문 후보를 확장해 fallback 반복을 줄임 |
| v1.70 | 2026-08-30 | Tech | 추상적인 짧은 질문을 초보자용 구체 질문으로 교체하는 가드 추가 |
| v1.71 | 2026-08-30 | Tech | config bench가 상위/하위 위치의 JSON 플래그를 동일하게 처리 |
| v1.72 | 2026-08-30 | Tech | Garden CLI가 읽기 전용 프로젝트 탐색 경로를 사용 |
| v1.73 | 2026-08-30 | Tech | targetStore가 조회 명령에서 Seed 루트를 생성하지 않음 |
| v1.74 | 2026-08-30 | Tech | Seed 저장 시 rolling backup과 본문 교체를 동일 큐로 직렬화 |
| v1.75 | 2026-08-30 | Tech | AsyncLocalStorage로 동시 harvest 렌더링 언어를 작업별 격리 |
| v1.76 | 2026-08-30 | Tech | harvest 문서 유형별 버전 계산·저장·이력을 동일 큐로 직렬화 |
| v1.77 | 2026-08-30 | Tech | AsyncLocalStorage로 동시 harvest 렌더링 언어 컨텍스트를 격리 |
| v1.78 | 2026-08-30 | Tech | branch/prune/lifecycle/growth 상태 변경을 Seed 파일 큐로 직렬화 |
| v1.79 | 2026-08-30 | Tech | 사용자 결정 기록도 Seed 상태 파일 큐로 직렬화 |
| v1.80 | 2026-08-30 | Tech | plant 검사·생성·이력을 Seed 파일 큐로 직렬화하고 중복 생성을 차단 |
| v1.81 | 2026-08-30 | Tech | AI 판단 위임·자연어 선택 요청을 안전하게 분류하고 광범위한 전략 질문을 구체 질문으로 교체하는 회귀 경계 추가 |
| v1.82 | 2026-08-30 | Tech | 재개 시 기존 open question도 동일한 초보자 용어·복잡도 가드로 검사하고 어려운 질문은 취소 후 쉬운 질문으로 교체 |
| v1.83 | 2026-08-30 | Tech | 준비·전략·우선순위 문장의 추상도 패턴을 질문 가드에 추가하고 재개·생성 경로 회귀 테스트 보강 |
| v1.84 | 2026-08-30 | Tech | 성장 안내 문구를 자유로운 자연어 도움 요청과 AI 자동 완화 동작에 맞춰 다국어 카탈로그로 갱신 |
| v1.85 | 2026-08-30 | Tech | prune 비대화형 출력에 갱신된 coreIdea를 추가하고 다국어 메시지 키를 검증 |
| v1.86 | 2026-08-30 | Tech | REPL 질문 공지 경로도 pending question 초보자용 검사를 거쳐 stale 질문 교체를 보장 |
| v1.87 | 2026-08-30 | Tech | persisted question 원문과 정규화 문장을 모두 beginner guard로 검사하도록 강화 |
| v1.88 | 2026-08-30 | Tech | Korean assumption fallback에서 sentence-shaped constraint interpolation을 제거하고 자연어 후보를 사용 |
| v1.89 | 2026-08-30 | Tech | product-intent guard와 명시적 1인칭 도움 신호를 결합해 mixed answer/control 입력의 오탐을 줄임 |
| v1.90 | 2026-08-30 | Tech | 단독 filler/delegation 입력을 질문 변경 안전망에 추가하고 제품 문장 경계 테스트 |
| v1.91 | 2026-08-30 | Tech | Korean/English 단독 막힘 어휘를 공통 입력 의도 안전망에 추가하고 회귀 케이스 보강 |
| v1.92 | 2026-08-30 | Tech | CI에 `node dist/cli/index.js --help` smoke 단계를 추가해 빌드 산출물 실행을 검증 |
| v1.93 | 2026-08-30 | Tech | GrowthUpdate의 contradictions/suggestions에도 초보자용 복잡도 필터를 적용하고 로컬 validation 질문을 구체화 |
| v1.94 | 2026-09-27 | Tech | Phase별 확장 로드맵과 구현 우선순위에서 merge를 Phase 2에서 Phase 3로 옮겨 PRD §6.18/§8과 정렬 |

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
| **Atomic Storage** | 파일 기반 로컬 저장의 무결성 보장 (원자적 쓰기, 백업) |
| **Multi-Provider Abstraction** | OpenAI, Gemini, Claude, Custom 등 상이한 API를 하나의 인터페이스로 추상화 |
| **Safe Key Management** | API Key를 평문으로 디스크에 저장하지 않기 |
| **Resilient Networking** | API 실패, rate limit, 타임아웃에 대한 graceful handling |
| **TUI Polish** | 색상·이모지·대화형 프롬프트를 안정적으로 제공 (스피너/멀티라인은 후속 확장) |

---

# 2. Architecture (아키텍처)

## 2.1 클리어 레이어 아키텍처

```text
┌──────────────────────────────────────────────┐
│              CLI Layer (Commander.js)         │
│   cli/index.ts (commands + prompts)           │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│              Core Layer                       │
│  seed-manager / growth / branch / maturity   │
│  harvest / lifecycle / garden / sunlight     │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│              AI Layer                          │
│  context-builder / provider / OAuth adapter   │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│              Storage Layer                     │
│  store.ts (JSON + backups + history)          │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│              UI (inside CLI layer)             │
│  chalk + @inquirer/prompts + i18n             │
└──────────────────────────────────────────────┘
```

## 2.2 의존성 관계

- **CLI → Core** : 명령어 처리가 Core 모듈에 위임
- **Core → AI**  : 성장/평가 시 AI 호출
- **Core → Storage** : 상태/대화 저장/로드
- **AI → Storage** : 프로바이더 설정 읽기
- **UI 출력** : CLI 핸들러에서 i18n·chalk·Inquirer를 조합

## 2.3 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| ** immutability by default** | Seed 상태 변경은 새 객체 복사 후 저장 (원본 훼손 방지) |
| **Graceful degradation** | AI 실패 시 로컬에서 가능한 기능(tree/garden)은 계속 동작 |
| **Idempotent harvest** | 같은 상태에서多次 harvest해도 같은 결과 (버전 관리 포함) |
| **Safe file writes** | `seed.json`은 저장 전 백업하고, 나머지 기록은 원자적 쓰기 또는 append-only로 보존 |
| **Testable separation** | 각 엔진은 외부 의존성 주입 가능 (mock 테스트 용이) |

---

# 3. Technology Stack (기술 스택)

## 3.1 언어 및 런타임

| 항목 | 버전/리소 |
|------|-----------|
| 언어 | TypeScript (strict mode) |
| 런타임 | Node.js >= 20 LTS (Deno/Bun 고려 — Phase 2) |
| 패키지 매니저 | npm (Node.js 20이상 내장) |
| TypeScript | 5.x |
| 빌드 | `tsc` → ESM output |
| 모듈 형식 | **ESM** (TypeScript에서 `--module nodenext`) — Node.js 20 LTS 권장 |
| 타입 | `strict: true`, `noUncheckedIndexedAccess: true` 권장 |

## 3.2 핵심 라이브러리

| 라이브러리 | 용도 | 이유 |
|------------|------|------|
| `commander` | CLI 프레임워크 | 널리 사용, 단순 구조 |
| `chalk` | 터미널 색상 | 크로스플랫폼, 불필요한 ANSI 관리 |
| `@inquirer/prompts` | 인터랙티브 선택 | 프롬프트, 컨펌트, 멀티셀렉트 |
| `zod` | 데이터 검증 | 모든 저장소 입출력 스키마 검증 |
| `ai` | LLM 호출 어댑터 | OpenAI OAuth 모델 호출 |
| `@openai-oauth/local` / `@openai-oauth/ai-sdk` | OpenAI 계정 인증 | 로컬 OAuth 자격 증명과 AI SDK 연결 |
| `openai-oauth` | 브라우저 로그인 | PKCE + localhost loopback callback |
| 내장 `fetch` (Node 20) | HTTP | OpenAI-compatible, Gemini, Anthropic, sunlight 검색 |

## 3.3 개발 도구 (Dev Dependencies)

| 도구 | 용도 |
|------|------|
| Vitest | 테스트 |
| TypeScript compiler (`tsc --noEmit`) | 타입 검사·린팅 게이트 |
| Prettier | 포맷터 |
| tsx | 개발 시 스크립트 실행 |

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

- 권장: **Node.js 20 LTS 이상**
- 이유: 내장 `fetch`, ESM 지원, `--module nodenext` 호환

## 4.3 설치/실행

```bash
# 글로벌 설치 (OQ2: npm 패키지명)
npm install -g @seed-cli/seed

# npx (권장)
npx @seed-cli/seed

# 프로젝트에 설치한 뒤 바이너리 실행
npm install @seed-cli/seed
npx seed

```

> **OQ2 결정:** npm `seed` 패키지는 현재 점유 중으로 `@seed-cli/seed` 사용. CLI 바이너리 명은 여전히 `seed`.

## 4.4 의존성 설치 가능 없는 실행 (optional)
- Node.js 미설치 사용자 → **Node.js 20+ 미설치 시 안내 메시지** 출력 (설치 가이드 링크 포함)

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
  focus: z.enum(['user', 'problem', 'goal', 'constraint', 'assumption', 'validation']).optional(),
  importance: z.enum(['low', 'medium', 'high']),
  status: z.enum(['open', 'answered', 'cancelled']),
  answer: z.string().optional(),
  answeredAt: z.string().datetime().optional(),
  cancelledAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
```

성장 입력은 먼저 대화 제어 의도를 확인한다. `다른 질문`, `너무 어려워 다른질문`,
`아직 잘 모르겠어요`, `잘 모르겠어`, `왜 이걸 물어봐?`,
`답을 어떻게 해야 할지 모르겠어`, `rephrase`, `skip` 등 예측하기 어려운 도움 요청은
답변 증거가 아니다. 현재 `open` 질문을 `cancelled`로 표시하고 같은 초점의 더 쉬운
질문을 만든다. 이 제어 입력은 conversation에 `metadata.intent = "change-question"`로
남기며 Seed 요약·성숙도에는 반영하지 않는다. 질문은 비개발자도 이해할 수 있는
일상어를 사용하고, 내부 분류명(`assumption`, `validation`, `scope`, `signal` 등)을
사용자에게 노출하지 않는다. 질문 변경 직후에는 `preferSimpleQuestion` 컨텍스트를
함께 보내 사람·상황·행동·결과 중 하나만 묻는 짧은 질문을 우선하게 한다.
빈 Enter나 `잠깐 생각해볼게`, `여기까지`, `I'll answer later` 같은 pause 입력은
질문을 취소하지 않고 그대로 재개할 수 있게 한다.
명시적인 표현으로 판단하기 어려운 입력은 설정된 LLM에 `GROW_INPUT_CLASSIFY` 요청을
보내 `answer`, `change-question`, `pause` 중 하나로 분류한다. LLM 호출 실패 시에는
로컬 안전망을 사용하고, 모델이 명백한 도움 요청을 `answer`로 잘못 반환해도 안전망이
이를 덮어써서 아이디어에 저장하지 않는다. 그 밖의 알 수 없는 문장은 답변으로
보존해 사용자의 생각을 잃지 않는다.

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
│   │   └── index.ts                    # CLI 엔트리·Commander 명령·공통 인자·핸들러
│   │       # plant/grow/water/... 핸들러는 도메인 엔진을 조합
│   │
│   ├── core/
│   │   ├── seed-manager.ts             # CRUD, 상태 머신, save/load
│   │   ├── growth.ts                   # grow 질문·답변·상태 갱신
│   │   ├── branch.ts                   # branch/prune
│   │   ├── maturity.ts                 # bloom 점수 산출
│   │   ├── harvest.ts                  # harvest 산출물 생성
│   │   ├── lifecycle.ts                # wither/wake/restore
│   │   ├── garden.ts                   # garden 프로젝트 탐색
│   │   └── sunlight.ts                 # sunlight 리서치 (Phase 2)
│   │
│   ├── ai/
│   │   ├── context-builder.ts          # AI 호출 시 컨텍스트 조립
│   │   ├── openai-oauth.ts             # 로컬 브라우저 OAuth·토큰 경로
│   │   ├── provider.ts                 # LLMProvider와 OpenAI/Gemini/Claude/Custom 구현
│   │   └── provider-registry.ts        # Provider 레지스트리 (확장 지점)
│   │
│   ├── storage/
│   │   └── store.ts                    # JSON 저장, 대화/branch/research/harvest/config
│   │
│   └── utils/
│       ├── path.ts                     # .seed 경로 탐색 (CWD → root)
│       └── fs.ts                       # atomic write, backup, JSONL 유틸리티
│
├── tests/
│   ├── core.test.ts                   # seed/grow/branch/maturity/harvest/lifecycle
│   ├── provider.test.ts               # provider/OAuth/context 계약
│   └── i18n.test.ts                   # 언어 우선순위·폴백
│
├── .gitignore
├── package.json
├── tsconfig.json
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
// src/core/maturity.ts
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
// src/ai/provider.ts

export type ProviderMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ProviderConfig = {
  id: string;                // 고유 식별자 ("openai", "gemini", "custom-1")
  name: string;              // 표시용 이름 ("OpenAI GPT-5.6 Luna", "Gemini 1.5 Pro")
  type: 'openai' | 'gemini' | 'anthropic' | 'custom';
  baseUrl?: string;          // OpenAI-compatible일 때
  defaultModel: string;
  temperature?: number;
  maxTokens?: number;
  enabled: boolean;
  connectionMode?: 'api-key' | 'oauth';  // OpenAI만 OAuth 가능
}

export interface LLMProvider {
  readonly id: string;
  readonly model: string;

  ask(prompt: string): Promise<string>;
  chat(messages: ProviderMessage[]): Promise<string>;
  stream(prompt: string): AsyncIterable<string>;

  testConnection(): Promise<{ success: boolean; error?: string; latencyMs: number }>;

  listModels(): Promise<string[]>;
}
```

## 8.2 Provider Registry

```typescript
// ai/provider-registry.ts
export class ProviderRegistry {
  private providers: Map<string, LLMProvider> = new Map();
  register(provider: LLMProvider): void { this.providers.set(provider.id, provider); }
  get(id: string): LLMProvider | undefined { return this.providers.get(id); }
  list(): LLMProvider[] { return [...this.providers.values()]; }
}
```

## 8.3 OpenAI Provider 상세

### 연결 방식 1: API Key (기본)
```typescript
// src/ai/provider.ts (OpenAI-compatible provider)
const provider = new OpenAICompatibleProvider(config, apiKey, language);
const text = await provider.chat(messages);
// 내장 fetch가 `${baseUrl}/chat/completions`를 호출하고 응답을 공통 문자열로 변환한다.
// API 키는 SEED_OPENAI_API_KEY 또는 OPENAI_API_KEY에서만 읽는다.
```

### 연결 방식 2: OAuth 계정 연동 (OpenAI 전용)

현재 구현은 `openai-oauth`의 로컬 브라우저 OAuth loopback 흐름을 사용한다. authorize URL은 브라우저로 열고 localhost callback(기본 1455)을 기다리며, 자격 증명은 `~/.seed/oauth/openai.json`에 저장한다. 기존 `~/.codex/auth.json`은 첫 사용 시 Seed 경로로 가져온다.
```typescript
import { runOpenAIOAuthLogin } from 'openai-oauth';
import os from 'node:os';
import path from 'node:path';

export async function openaiOAuthLogin(configId: string): Promise<OAuthResult> {
  // openai-oauth manages PKCE/state, the browser authorize URL, and the
  // localhost callback. Seed only chooses its project-independent auth path.
  const saved = await runOpenAIOAuthLogin({
    authFilePath: process.env.SEED_OPENAI_AUTH_FILE ?? path.join(os.homedir(), '.seed', 'oauth', 'openai.json'),
    openBrowser: false, // Seed adds the Codex originator and opens the URL itself.
  });
  return { success: true, expiresAt: saved.auth.lastRefresh };
}

// @openai-oauth/local의 ensureFresh 세션 조회가 필요할 때 토큰을 갱신한다.
const token = await getOpenAIToken();
```

## 8.4 Gemini Provider

```typescript
// Gemini/Anthropic도 동일한 LLMProvider를 구현하지만, 내장 fetch로 각
// provider의 요청 envelope(user/model role, system instruction)를 만든다.
// 키는 SEED_GEMINI_API_KEY/GEMINI_API_KEY 또는 SEED_ANTHROPIC_API_KEY에서 읽는다.
```

## 8.5 Custom Provider (OpenAI-compatible)

```typescript
// Custom provider도 OpenAICompatibleProvider를 재사용한다.
const provider = new OpenAICompatibleProvider(config, providerKey(config)!, language);
const text = await provider.chat(messages);
```

## 8.6 설정 저장 구조

### 전역 설정 (`~/.seed/config.json`)
```json
{
  "version": 1,
  "lang": "en",
  "activeProvider": "openai",
  "setupCompleted": true,
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI GPT-5.6 Luna",
      "type": "openai",
      "connectionMode": "api-key",
      "defaultModel": "gpt-5.6-luna",
      "enabled": true,
      "temperature": 0.7,
      "maxTokens": 4096
    },
    {
      "id": "local",
      "name": "Local fallback",
      "type": "custom",
      "defaultModel": "rule-based",
      "enabled": true
    }
  ]
}
```

### API Key 보안 전략

```
API 키 모드에서는 환경변수(예: `SEED_OPENAI_API_KEY`, `OPENAI_API_KEY`,
`SEED_GEMINI_API_KEY`)만 읽는다. OpenAI OAuth 모드에서는 별도의
`~/.seed/oauth/openai.json` 세션만 읽으며 API 키로 묵시적 전환하지 않는다.
API 키는 설정 파일이나 프로젝트 `.seed/`에 저장하지 않는다. OAuth 파일은 프로젝트 외부에
두고, 환경변수와 파일 경로를 모두 사용자가 직접 제어한다.
```

### 프로젝트별 오버라이드 (`.seed/config.json`)
```json
{
  "activeProvider": "gemini",
  "lang": "ko"
}
```
프로젝트 설정은 전역 설정과 병합되며 현재 작업 디렉터리에서 상위로 탐색된다.
프로젝트 내부에서 실행한 설정 변경은 이 오버라이드 파일에 저장하고, 프로젝트 밖의 변경은 전역 파일에 저장한다.

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
export function buildContext(
  seedState: SeedState,
  command: string,       // 'grow', 'bloom', 'harvest.prd' 등
  recentConversation: ConversationEntry[] = [],
  currentBranch?: Branch,
  extras: { relevantHistory?: GrowthEvent[]; sunlightResearch?: ResearchEntry[] } = {},
): AIContext {
  const decisions = [...seedState.decisions, ...(currentBranch?.decisions ?? [])]
    .filter((decision) => decision.confirmedByUser).slice(-10);
  const openQuestions = seedState.openQuestions
    .filter((question) => question.status === 'open' && (currentBranch ? (!question.branchId || question.branchId === currentBranch.id) : !question.branchId))
    .slice(-12);
  return {
    seedState,
    coreIdea: currentBranch?.summary ?? seedState.coreIdea,
    importantDecisions: decisions,
    openQuestions,
    recentConversation: recentConversation.slice(-10),
    ...(extras.relevantHistory?.length ? { relevantHistory: extras.relevantHistory.slice(-12) } : {}),
    ...(currentBranch ? { currentBranch, branchContext: { decisions: currentBranch.decisions.filter((decision) => decision.confirmedByUser).slice(-10), openQuestions: currentBranch.openQuestions.filter((question) => question.status === 'open').slice(-10) } } : {}),
    ...(extras.sunlightResearch?.length ? { sunlightResearch: extras.sunlightResearch.slice(-8) } : {}),
    systemPrompt: `You are Seed's Gardener. Help the idea grow through ${command}; ask one easy, focused question in everyday language, reflect the user's words, and never invent facts or decisions.`,
  };
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
  // Queue replacements per path and use a unique sibling staging file.
  // This avoids cross-wired temporary files and Windows rename races when
  // multiple commands save the same state at once.
  await queueFor(filePath, async () => {
    const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tmpPath, data, 'utf-8');
      if (process.platform === 'win32') await fs.rm(filePath, { force: true });
      await fs.rename(tmpPath, filePath);
    } finally {
      await fs.rm(tmpPath, { force: true });
    }
  });
}

// Append-only event writes use the same per-path queue so JSONL records are
// never interleaved during concurrent command execution.
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
| `--no-input` | 인터랙티브 프롬프트 비활성화 |

---

# 13. Configuration (설정)

## 13.1 설정 우선순위

```text
명령행 옵션 (--lang / --provider / --model)
  ▲ override
환경변수 (SEED_LANG, provider별 API key 등)
  ▲ override
프로젝트 설정 (.seed/config.json)
  ▲ override
전역 설정 (~/.seed/config.json)
  ▲ override
기본값 (영어 UI·local fallback)
```

## 13.2 환경변수

| 변수 | 용도 |
|------|------|
| `SEED_OPENAI_API_KEY` | OpenAI API Key |
| `OPENAI_API_KEY` | OpenAI API Key (fallback) |
| `SEED_GEMINI_API_KEY` | Gemini API Key |
| `SEED_ANTHROPIC_API_KEY` | Anthropic Claude API Key |
| `SEED_OPENAI_BASE_URL` | OpenAI-compatible Base URL 오버라이드 |
| `SEED_OPENAI_MODEL` | OpenAI API-key 모드 모델 오버라이드 |
| `SEED_OPENAI_OAUTH_MODEL` | OpenAI OAuth 모드 모델 오버라이드 |
| `SEED_OPENAI_AUTH_FILE` | OpenAI OAuth 자격 증명 경로 오버라이드 |
| `SEED_AI_TIMEOUT_MS` | AI 요청 타임아웃(ms) |
| `SEED_MAX_GROW_TURNS` | 인터랙티브 성장 턴 상한 |
| `SEED_HOME` | `~/.seed/` 오버라이드 |

---

# 14. Error Handling (에러 처리)

## 14.1 에러 유형

현재 CLI는 작업 경계에서 안정적인 문자열 오류 코드를 사용한다. 예: `no-seed`,
`provider-credential-missing`, `provider-not-configured:<id>`,
`branch-selection-not-found`, `invalid-harvest`.

## 14.2 복구 전략

| 에러 | 복구 |
|------|------|
| API Key 없음 | `seed config` 마법사 안내 |
| API 호출 실패 (네트워크) | 공통 요청 계층이 안전한 오류를 최대 3회 재시도하고, 성장 작업은 로컬 fallback으로 계속 |
| API rate limit | 대기 후 재시도 + 명확한 메시지 |
| AI 응답 파싱 실패 | JSON 블록/객체를 best-effort 추출하고, 실패 시 결정론적 로컬 응답 사용 |
| `.seed/` 디렉터리 쓰기 실패 | 오류 코드를 그대로 전달하고 기존 상태를 백업으로 보존 |
| 프로바이더 미설정 | 명시적 프로바이더는 오류, 자동 활성 프로바이더는 로컬 fallback |
| JSON 스키마 검증 실패 | `SeedStore.load()`가 오류를 전달하고 `.backup/` 파일을 보존 |

## 14.3 AI 응답 파싱 (JSON extraction)

```typescript
// src/ai/provider.ts
function parseJsonObject(response: string): Record<string, unknown> | undefined {
  // fenced JSON → 첫 { 부터 마지막 }까지 best-effort 추출
}
```

---

# 15. Security Considerations (보안)

## 15.1 API Key 관리

- API 키는 환경변수에서만 읽고 프로젝트 `.seed/`나 config JSON에 저장하지 않는다.
- `.seed/`는 gitignore 대상이며 OAuth 자격 증명은 프로젝트 밖 `~/.seed/oauth/openai.json`에 둔다.
- OAuth 세션은 `@openai-oauth/local`의 만료 갱신을 사용하고, 실패하면 재인증 오류를 표시한다.

## 15.2 입력 검증

- 아이디어·답변·결정은 빈 값과 대상 선택을 CLI 경계에서 검증한다.
- Seed·Research·Harvest 파일은 Zod 스키마로 로드 시 검증한다.
- AI 응답은 JSON 파싱·필드 보정 후 신뢰하며, 파싱 실패 시 로컬 fallback을 사용한다.

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
        node-version: [20, 22]
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
  "license": "MIT",
  "bin": {
    "seed": "dist/cli/index.js"   // 바이너리 명은 여전히 'seed'
  },
  "type": "module",
  "files": ["dist/", "README.md", "assets/", "LICENSE"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "prepare": "npm run build",
    "dev": "tsx src/cli/index.ts",
    "start": "node dist/cli/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit -p tsconfig.json",
    "format": "prettier --write ."
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

| 채널 | 용도 |
|------|------|
| `.seed/history/events.jsonl` | 명령어 완료와 상태 변경의 append-only 기록 |
| `stderr` | 지역화된 오류와 설정·프로바이더 실패 안내 |
| 원격 로그/텔레메트리 | 사용하지 않음 (기본값) |

현재 CLI는 외부 로그 파일이나 원격 텔레메트리를 만들지 않습니다. 상태 변경은
`.seed/history/events.jsonl`에 append-only 이벤트로 남고, 오류는 명령 종료 코드와
지역화된 메시지로 반환됩니다. 프로바이더 요청은 타임아웃·재시도 후 로컬 fallback으로
이어집니다.

## 19.2 토큰/비용 추적 (Phase 2)

- 프로바이더별 비용·토큰 usage 수집은 Phase 2 범위
- 현재 `config bench`는 연결된 프로바이더 응답을 비교하고 원격 데이터를 전송하지 않음

## 19.3 오류 로그

- 현재 별도 오류 로그 파일은 만들지 않음
- 사용자는 `.seed/history/events.jsonl`과 CLI stderr를 통해 실패 원인을 확인

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
| `LLMProvider` 인터페이스 | 새 프로바이더(Anthropic Claude, 맞춤형) 추가 시 구현만 추가 (OQ5: Ollama 외부 모델은 공식 미지원, 내장 fallback 제공) |
| `HarvestType` 열거형 | 새 산출물(비즈니스 플랜, 기획서 등) 추가 시 enum 확장 |
| `ContextBuilder` | 전체 → 부분 압축 전략, 멀티모달(이미지) 확장 대비 |
| `SeedStore` | JSON → SQLite → Cloud 저장소 전환 인터페이스 |
| `Branch` 모델 | merge 기능 추가 시 연결 관계만 확장 |
| 이벤트 로그(JSONL) | 분석·리포트·대시보드 기반 데이터 |

## 21.2 Phase별 확장 로드맵

| Phase | 기능 | 기술 확장 |
|-------|------|-----------|
| Phase 1 (MVP) | seed/grow/branch/prune/bloom/tree/history/harvest | JSON 저장, 멀티 프로바이더, CLI REPL |
| Phase 2 | water/sunlight/evolve/wither/wake/garden/restore (구현 완료) | SQLite 저장 전환은 선택 사항으로 보류, web 검색 통합 완료, 토큰/비용 표시는 미구현 |
| Phase 3 | merge, Web UI, Visual Tree, Cloud Sync, Collaboration | REST API 서버, DB 전환, 인증, 실시간 동기화 |

---

# 22. 구현 우선순위 (Implementation Priority)

Seed.md #65 기준 + 기술 의존성 반영:

```
우선순위 1 (Phase 1 — MVP 필수):
  ────────────────────────────────
  [1]  Zod 스키마 정의 (5장 데이터 모델)
  [2]  Storage layer (`SeedStore` in `src/storage/store.ts`)
  [3]  Provider abstraction + OpenAI Provider + config store
  [4]  CLI framework + seed 명령어 (plant)
  [5]  Context Builder
  [6]  Growth engine (`src/core/growth.ts`)
  [7]  Branch engine (`src/core/branch.ts`)
  [8]  Maturity engine (`src/core/maturity.ts`)
  [9]  Tree renderer (`src/cli/index.ts`)
  [11] History (event log)
  [12] Harvest Engine (idea, prd, trd)
  [13] TUI (chalk, Inquirer prompts)
  [14] i18n 패키지 (영어 + 한국어, §25 참조)

우선순위 2 (Phase 2):
  ─────────────────────
  [14] water — 구현 완료
  [15] sunlight (+ web search) — 구현 완료
  [16] evolve — 구현 완료
  [17] wither / wake — 구현 완료
  [18] garden — 구현 완료
  [19] restore — 구현 완료
  [20] harvest readme / prompt — 구현 완료
  [21] 멀티 프로바이더 벤치마크 (`config bench`) — 구현 완료
  [22] SQLite 저장소 전환 (선택) — 미구현, 보류

우선순위 3 (Phase 3):
  ─────────────────────
  [23] merge (branch 결합) — 미구현
  [24] Web UI / Dashboard
  [25] Visual Tree
  [26] Cloud Sync
  [27] Collaboration
  [28] AI Personas
```

---

# 23. 파일 구조 요약 (Key Files)

| 파일 | 역할 | 핵심 구현 |
|------|------|-----------|
| `src/cli/index.ts` | CLI 엔트리 | Commander 설정, 공통 옵션 |
| `src/core/seed-manager.ts` | Seed CRUD + 상태 머신 | save/load/update/transition |
| `src/core/growth.ts` | grow 질문·답변·상태 갱신 | AI 호출 → 요약/성숙도 갱신 |
| `src/core/branch.ts` | branch/prune | 가지 관리 |
| `src/core/lifecycle.ts` | evolve/wither/wake/restore | 수명주기·복구 관리 |
| `src/core/maturity.ts` | bloom 점수 산출 | 8차원 계산 + penalty/bonus |
| `src/ai/provider-registry.ts` | 프로바이더 등록/관리 | 멀티 프로바이더 오케스트레이션 |
| `src/ai/provider.ts` | LLMProvider + OpenAI/Gemini/Anthropic/Custom | 역할 기반 chat, JSON 파싱, 재시도·fallback |
| `src/ai/input-intent.ts` | 성장 입력 의도 안전망 | 초보자 도움 요청·pause와 아이디어 문장 구분 |
| `src/ai/openai-oauth.ts` | OpenAI 계정 OAuth | loopback 로그인·Seed auth 경로 |
| `src/ai/context-builder.ts` | AI 호출 컨텍스트 조립 | 최근 대화·이력·리서치 예산 제한 |
| `src/storage/store.ts` | 상태·설정 저장/로드 | 원자적 JSON·백업·프로젝트 오버라이드 |
| `src/core/sunlight.ts` | 공개 검색 | 선택적 웹 출처 수집 |
| `src/core/harvest.ts` | 산출물 수확 | 버전 Markdown·결과 JSON |

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
7. Assume the user may be new to software and vibe coding. Use everyday words;
   do not expose terms such as assumption, validation, scope, signal, MVP,
   persona, roadmap, or tech stack without explaining them simply.
8. Treat confusion, “ask another question,” requests for examples, and “why
   are you asking?” as a request for help, never as product evidence.
9. Your tone: a gardener nurturing a seed — thoughtful, not cheerleading.
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

> **OQ6 결정:** 영어(기본) + 한국어 지원. UI 문구는 언어 팩, AI 콘텐츠는 사용자의 최신 입력 언어를 따른다. PRD §6.19 (F-17) 참조.

## 25.1 언어 팩 구조

```text
src/i18n/
├── index.ts            # t() 함수, 로더, 폴백
├── en.json             # 영어 팩 (기본)
└── ko.json             # 한국어 팩
```

### 키 기반 로더

```typescript
// src/i18n/index.ts
import en from './en.json' with { type: 'json' };
import ko from './ko.json' with { type: 'json' };

export type Language = 'en' | 'ko';
const catalogs: Record<Language, Record<string, string>> = { en, ko };

// t() performs ko → en → key fallback and {name} replacement.
```

## 25.2 언어 결정 우선순위

```typescript
// src/cli/index.ts + src/i18n/index.ts
// --lang → SEED_LANG → project/global config → English default
const language = startupLanguage();
setLanguage(language);
await initializeLanguage(commandOptions.lang);
```

## 25.3 적용 대상 (코드 규칙)

| 대상 | i18n 적용 | 비고 |
|------|-----------|------|
| 배너/인사말/고정 메시지 | ✅ `t('...')` 필수 | renderer/prompts 전부 |
| 명령어 설명 (`.description()`) | ✅ | help 출력 |
| 에러 메시지 | ✅ | CLI 오류 코드 기반 t() |
| 인터랙티브 선택지/메뉴 | ✅ | |
| AI 시스템 프롬프트 | ❌ (영문 고정) | 모델이 사용자 언어로 답변 |
| AI 질문/요약 콘텐츠 | ❌ (입력 언어 기반) | 사용자의 최신 입력 언어를 따라감 |
| Harvest 문서 (PRD/TRD) | ✅ 선택적 | `harvest prd --lang ko` 시 한글 구조 템플릿 |

## 25.4 Harvest 문서 언어 제어

```typescript
// prd.ts 에서
const docLang = cliOptions.lang ?? currentLanguage(); // harvest 명령의 --lang
// PRD 구조 템플릿(섹션 제목 등)을 해당 언어로 렌더링
// 단, 내용(AI 생성)은 사용자 결정/입력 언어 따라감
```

## 25.5 수락 기준 (AC) — 기술

- [ ] AC-TR-i18n-1: `SEED_LANG=ko` + `npx seed` 시 모든 고정 문구가 한국어
- [ ] AC-TR-i18n-2: 플래그·환경변수·설정이 없으면 호스트 로케일과 무관하게 영어
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
> - AI 프로바이더 상세 설정 (OpenAI 계정연동/OAuth + API, Gemini API, Anthropic Claude API, Custom Provider)
> - 타입 시스템, 저장 구조, 컨텍스트 아키텍처
> - 테스트, 배포, 에러 처리, 보안 전략
> - **OQ1~7 결정 반영** (텔레메트리 off, @seed-cli/seed, 무료+후원, npm 우선, 로컬 미지원, 다국어 en/ko, OpenAI Local Browser OAuth)
> - i18n 다국어 아키텍처 (§25)
> - Phase 1~3 릴리스 로드맵
---
