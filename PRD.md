# 🌱 SEED — Product Requirements Document (PRD)

> **Seed your idea. Grow what matters.**
>
> 버전: v1.93 (작성일: 2026-08-30)
> 상태: Draft → Review
> 문서 작성 기준: `Seed.md` (제품 전체 기획 및 설계 명세서) v1

---

## 문서 이력 (Document History)

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| v0.1 | 2026-08-29 | Product | Seed.md 기반 1차 초안 |
| v1.0 | 2026-08-29 | Product | AI Provider 설정 요구사항 반영, 구조 상세화 |
| v1.2 | 2026-08-30 | Product | OpenAI 계정 로그인을 실제 `openai-oauth` 로컬 브라우저 흐름으로 정렬 |
| v1.3 | 2026-08-30 | Product | OpenAI 기본 모델을 `gpt-5.6-luna`로 통일 |
| v1.4 | 2026-08-30 | Product | 질문 변경·pause 제어, 대화 근거·성장 이력 컨텍스트, 모순 확인 흐름 반영 |
| v1.5 | 2026-08-30 | Product | 비개발자용 쉬운 질문, 예측 불가 입력의 AI 의도 분류, 상태 복구 흐름 반영 |
| v1.6 | 2026-08-30 | Product | 선택 언어 help 제목, provider 실패 fallback, 초보자용 출력 보호 반영 |
| v1.7 | 2026-08-30 | Product | 모호한 도움 요청의 로컬 안전 판정과 생성 결과의 초보자용 용어 필터 강화 |
| v1.8 | 2026-08-30 | Product | 빈 답변·잘못된 옵션의 JSON 오류 경로와 비활성 가지 보호 반영 |
| v1.9 | 2026-08-30 | Product | 과도하게 긴 질문 자동 완화와 bloom/sunlight 결과의 초보자용 출력 보호 반영 |
| v1.10 | 2026-08-30 | Product | 비활성 branch 보호와 parser JSON 오류, 복합 질문 완화 규칙 반영 |
| v1.11 | 2026-08-30 | Product | 자연스러운 도움·혼란 표현을 AI/로컬 안전망으로 분류하고, 잘못된 AI 질문을 쉬운 질문으로 자동 교체 |
| v1.12 | 2026-08-30 | Product | 저장 상태·대화·가지·이벤트 구조 검증과 손상 기록 격리 반영 |
| v1.13 | 2026-08-30 | Product | wake 재성장 대화에도 도움 요청 판정 적용, 설정 JSON 경계와 OAuth 재활성화 흐름 보강 |
| v1.14 | 2026-08-30 | Product | 여러 명령이 동시에 실행돼도 상태 파일이 서로 덮어쓰지 않도록 안전한 저장 흐름 보강 |
| v1.15 | 2026-08-30 | Product | Windows 동시 저장 경쟁 조건을 직렬화하고 임시 파일 정리를 보장 |
| v1.16 | 2026-08-30 | Product | wake·설정 삭제 경계에서 잘못된 입력이 아이디어·설정을 조용히 변경하지 않도록 오류 흐름 보강 |
| v1.17 | 2026-08-30 | Product | 라이프사이클·가지 상태 갱신을 최신 저장 상태 기준으로 통일하고 대소문자 입력 경계를 보강 |
| v1.18 | 2026-08-30 | Product | 어려움+질문 변경 혼합 표현의 안전 분류, 동시 이벤트 append 직렬화, 중첩 경로 garden 탐색, 수확 메뉴 다국어화 반영 |
| v1.19 | 2026-08-30 | Product | 짧은 긍정·부정 답변의 모델 오판 방지와 아이디어 문장 속 ‘어렵다/다른 질문’ 오탐 완화 |
| v1.20 | 2026-08-30 | Product | 아이디어 설명 문장과 실제 질문 변경 요청을 구분하는 공통 대화 의도 판정 보강 |
| v1.21 | 2026-08-30 | Product | 수확 README에 설명·구조 섹션을 보장하고 초보자용 관점 문구를 정리 |
| v1.22 | 2026-08-30 | Product | 질문 변경 뒤에는 사람·상황·행동 중심의 더 쉬운 질문을 우선하도록 적응형 대화 규칙을 보강 |
| v1.23 | 2026-08-30 | Product | 자연어 pause·혼란 표현을 확장하고 JSON 모드에서 대화형 선택이 섞이지 않도록 보강 |
| v1.24 | 2026-08-30 | Product | 정상적인 아이디어 문장과 pause 표현의 오탐을 줄이고 단독 가지치기 후 루트 대화를 복구 |
| v1.25 | 2026-08-30 | Product | Custom Provider 환경변수와 자연어 pause 표현 지원을 설정 마법사까지 일관되게 연결 |
| v1.26 | 2026-08-30 | Product | AI 판단을 설명하는 정상적인 아이디어 문장이 제어 입력으로 오인되지 않도록 경계를 보수화 |
| v1.27 | 2026-08-30 | Product | 문장 속 보류·혼란 표현까지 오프라인 안전망이 처리하도록 자연어 범위를 확장 |
| v1.28 | 2026-08-30 | Product | 리서치 저장도 동일한 스키마 검증을 거치도록 저장 무결성 기준을 통일 |
| v1.29 | 2026-08-30 | Product | 초보자의 짧은 어려움·막힘 표현을 오프라인 안전망에서도 질문 변경으로 판정하고 정상 아이디어 문장과 구분 |
| v1.30 | 2026-08-30 | Product | Garden에서 Seed를 번호·이름·ID·경로로 선택해 대화형 작업공간으로 진입하는 흐름 구체화 |
| v1.31 | 2026-08-30 | Product | 짧은 어려움·막힘과 AI 판단 요청이 섞인 자연어도 초보자 도움 흐름으로 안전하게 연결 |
| v1.32 | 2026-08-30 | Product | 주어가 붙은 짧은 어려움 표현까지 질문 변경 흐름에서 안정적으로 처리 |
| v1.33 | 2026-08-30 | Product | 프로젝트 내부 설정 변경을 `.seed/config.json` 오버라이드에 저장하도록 명시 |
| v1.34 | 2026-08-30 | Product | 손상된 언어 설정을 저장·출력하지 않고 영어 기본값으로 정규화 |
| v1.35 | 2026-08-30 | Product | 실행되지 않는 이전 분류 경로와 수확 산출물의 placeholder 흔적 제거 |
| v1.36 | 2026-08-30 | Product | 초보자의 다양한 어려움·막힘 표현을 신호 조합으로 판정하고 정상적인 제품 설명 오탐을 방지 |
| v1.37 | 2026-08-30 | Product | 보류와 질문 변경이 섞인 자연어를 공통 판정기로 구분하고 모든 수확 기록의 저장 무결성을 보장 |
| v1.38 | 2026-08-30 | Product | 보류 접두어가 붙은 질문 변경 요청과 짧은 자연어 요청을 안전하게 구분 |
| v1.39 | 2026-08-30 | Product | 추임새가 붙은 예시·쉬운 질문 요청과 정상적인 사용자 요구 문장을 구분 |
| v1.40 | 2026-08-30 | Product | 수확 메뉴 제목을 공통 다국어 카탈로그로 통합 |
| v1.41 | 2026-08-30 | Product | 선택 기능의 로컬 질문도 비개발자가 바로 답할 수 있는 일상어로 통일 |
| v1.42 | 2026-08-30 | Product | 답변하기 어렵다는 자연어와 추임새가 섞인 도움 요청을 안전하게 처리 |
| v1.43 | 2026-08-30 | Product | 선택 기능의 AI 출력에서도 기술 용어가 초보자에게 노출되지 않도록 필터 강화 |
| v1.44 | 2026-08-30 | Product | 짧은 건너뛰기·다른 질문 요청을 자연어로 인식하고 잘못된 선택 입력은 상태를 변경하지 않도록 보강 |
| v1.45 | 2026-08-30 | Product | 오프라인 관점·현실 점검 결과도 비개발자용 일상어로 통일 |
| v1.46 | 2026-08-30 | Product | JSON 오류도 stdout의 단일 객체로 제공해 스크립트가 일관되게 파싱하도록 보강 |
| v1.47 | 2026-08-30 | Product | 제3자·제품 설명 속 어려움 표현은 질문 변경 요청으로 오인하지 않도록 보수적 경계 보강 |
| v1.48 | 2026-08-30 | Product | 빈 가지 이름·설명·가지치기 대상을 저장하지 않고 즉시 안내하도록 입력 검증 보강 |
| v1.49 | 2026-08-30 | Product | 상태 파일이 손상돼도 유효한 최근 백업이 있으면 아이디어를 자동 복구하도록 보강 |
| v1.50 | 2026-08-30 | Product | OAuth 로그인 진행 문구도 선택한 언어와 동일하게 표시하도록 통합 |
| v1.51 | 2026-08-30 | Product | 새 환경에서 언어·AI 선택·모델 기본값·아이디어 입력이 이어지는 첫 실행 흐름 검증 |
| v1.52 | 2026-08-30 | Product | 현재 상태 파일이 없어도 유효한 백업이 있으면 기존 Seed로 인식해 덮어쓰기를 방지 |
| v1.53 | 2026-08-30 | Product | 잘못된 언어 옵션으로 첫 실행해도 추가 선택 없이 영어 UI로 안전하게 fallback |
| v1.54 | 2026-08-30 | Product | Custom Provider의 빈 Base URL·모델 설정을 저장하지 않고 바로 안내 |
| v1.55 | 2026-08-30 | Product | 성장 질문 중 `/exit`·`/quit`·`/q`를 답변으로 저장하지 않고 즉시 세션 종료 |
| v1.56 | 2026-08-30 | Product | README에 성장 중 종료와 빈 Enter 일시정지 동작을 명시 |
| v1.57 | 2026-08-30 | Product | 현재 상태 파일이 없어도 유효한 백업 Seed를 Garden에서 계속 찾도록 보강 |
| v1.58 | 2026-08-30 | Product | `기술적으로`·`technically` 같은 변형도 초보자용 질문에서 자동 완화 |
| v1.59 | 2026-08-30 | Product | PRD/TRD 버전 참조를 최신 문서 이력과 동기화 |
| v1.60 | 2026-08-30 | Product | 모델·로컬 대체 질문이 모두 비정상이어도 초보자용 필수 초점 질문을 보장 |
| v1.61 | 2026-08-30 | Product | API·백엔드·배포 등 소프트웨어 용어가 초보자용 질문에 노출되지 않도록 자동 완화 |
| v1.62 | 2026-08-30 | Product | 긴 사용자 설명이 포함된 fallback 질문도 실제 표시 길이 80자 미만으로 제한 |
| v1.63 | 2026-08-30 | Product | 연결 테스트를 통과하지 못한 프로바이더 후보를 설정에 저장하지 않도록 정리 |
| v1.64 | 2026-08-30 | Product | 자연스러운 혼란·이해 부족 표현을 도움 요청으로 분류하고 일반 제품 설명은 보존 |
| v1.65 | 2026-08-30 | Product | 질문 변경 직후 시작 문구가 반복되지 않도록 대화 턴 표시를 정리 |
| v1.66 | 2026-08-30 | Product | history 조회가 이벤트 타임스탬프 기준으로 항상 시간순으로 정렬되도록 보강 |
| v1.67 | 2026-08-30 | Product | Custom Provider의 모델 이름을 필수 입력으로 검증하고 미완성 설정을 저장하지 않도록 보강 |
| v1.68 | 2026-08-30 | Product | 장기 대화에서도 전체 질문 이력과 대조해 같은 질문을 반복하지 않도록 보강 |
| v1.69 | 2026-08-30 | Product | 안전 질문 후보를 초점별로 확장해 장시간 대화의 fallback 반복을 줄임 |
| v1.70 | 2026-08-30 | Product | 짧아도 추상적인 질문을 감지해 초보자용 구체 질문으로 자동 완화 |
| v1.71 | 2026-08-30 | Product | config 하위 명령의 JSON 옵션 상속을 일관되게 보장 |
| v1.72 | 2026-08-30 | Product | Garden 탐색이 프로젝트 밖에서 빈 `.seed/`를 만들지 않도록 비파괴 처리 |
| v1.73 | 2026-08-30 | Product | 프로젝트가 없는 폴더에서 조회 명령이 `.seed/`를 만들지 않도록 비파괴 처리 |
| v1.74 | 2026-08-30 | Product | 동시 저장에서도 rolling backup과 현재 Seed 상태의 복구 경계를 보강 |
| v1.75 | 2026-08-30 | Product | 동시에 수확해도 문서별 선택 언어가 섞이지 않도록 격리 |
| v1.76 | 2026-08-30 | Product | 같은 문서 유형을 동시에 수확해도 버전이 겹치지 않도록 보강 |
| v1.77 | 2026-08-30 | Product | 동시에 생성하는 수확 문서의 언어 컨텍스트가 서로 섞이지 않도록 보강 |
| v1.78 | 2026-08-30 | Product | 동시에 브랜치를 만들어도 활성 브랜치 최대 5개를 넘지 않도록 보강 |
| v1.79 | 2026-08-30 | Product | 동시에 확정한 사용자 결정도 모두 보존하도록 보강 |
| v1.80 | 2026-08-30 | Product | 동시에 새 아이디어를 심어도 기존 Seed를 덮어쓰지 않도록 보강 |
| v1.81 | 2026-08-30 | Product | AI가 판단을 위임받은 자연어(“네가 정해줘”, “You decide”)도 질문 변경으로 안전하게 처리하고, 광범위한 전략 질문을 초보자용 질문으로 자동 완화 |
| v1.82 | 2026-08-30 | Product | 이전 실행에서 남은 어려운 대기 질문도 재개 시 자동 교체해 초보자용 대화 계약을 유지 |
| v1.83 | 2026-08-30 | Product | “만들기 전에 무엇을 확인할까요?”처럼 초보자에게 추상적인 준비·전략 질문까지 자동 완화 |
| v1.84 | 2026-08-30 | Product | 도움 요청 문구를 특정 명령어 암기 대신 자연어로 말하면 AI가 알아듣는 흐름으로 안내 |
| v1.85 | 2026-08-30 | Product | 가지치기 완료 후 현재 핵심 요약을 함께 보여줘 첫 버전 범위를 바로 확인할 수 있게 함 |
| v1.86 | 2026-08-30 | Product | REPL 재진입 경로에서도 예전의 어려운 대기 질문을 건너뛰지 않고 쉬운 질문으로 교체 |
| v1.87 | 2026-08-30 | Product | 재개 시 오래된 질문의 앞부분에 붙은 안내 문장까지 검사해 어려운 용어가 노출되지 않도록 보강 |
| v1.88 | 2026-08-30 | Product | 사용자의 문장형 제약을 질문에 어색하게 붙이지 않고 처음 보여줄 행동을 자연스럽게 묻도록 개선 |
| v1.89 | 2026-08-30 | Product | 아이디어 설명 뒤에 붙은 1인칭 어려움·판단 위임도 오프라인에서도 도움 요청으로 분류 |
| v1.90 | 2026-08-30 | Product | “그냥”, “글쎄요”, “Whatever” 같은 짧은 막힘 표현도 아이디어 내용으로 저장하지 않고 쉬운 질문으로 연결 |
| v1.91 | 2026-08-30 | Product | “모르겠음”, “어려움”, “No clue”, “I dunno” 같은 단독 막힘 표현도 자연스럽게 도움 요청으로 처리 |
| v1.92 | 2026-08-30 | Product | CI에서 빌드된 `seed --help` 실행 smoke 검사를 추가해 배포 엔트리포인트를 확인 |
| v1.93 | 2026-08-30 | Product | AI 후속 안내에도 초보자용 복잡도 가드를 적용하고 추상적인 로컬 질문 후보를 일상어로 교체 |
| v1.94 | 2026-09-27 | Product | 8.3절의 구현 완료 항목(water/sunlight/evolve/wither/wake/garden/restore/harvest readme·prompt)을 Should/Done으로 재분류하고, merge를 Phase 3 단일 미구현 항목으로 명확히 표시 |

---

# 1. Product Overview (제품 개요)

## 1.1 Product Name

**SEED** (코드명/제품명 모두 동일)

- CLI 바이너리 명: `seed`
- npm 패키지명: `@seed-cli/seed` (npm의 `seed` 이름 충돌을 피하기 위한 scoped 패키지)
- 제안 슬로건: *"Plant an idea. Grow it. Build it."* / *"From vague thought to clear direction."*

## 1.2 One-line Description

**Seed는 만들고 싶은 생각을 씨앗처럼 심고, AI가 정원사(Gardener)가 되어 쉬운 질문과 대화로 아이디어를 키운 뒤, 바이브코딩에 바로 쓸 수 있는 PRD/TRD 등을 수확(harvest)하게 해주는 CLI 도구다. 개발 경험이 없어도 한 줄로 시작할 수 있다.**

## 1.3 Vision

Seed는 단순한 "아이디어 채팅 도구"나 "PRD 생성기"가 아니다.

> 최종 비전: **아이디어가 탄생해서 실제 프로젝트가 되기까지의 전체 초기 사고 과정을 관리하는 "Idea Development Environment (IDE for Ideas)"**

사용자는 아래 흐름을 경험한다.

```text
🌱 idea → 💧 think → 🌿 explore → ✂️ focus → ☀️ validate → 🌸 define → 🍎 harvest → 🧑‍💻 build
```

핵심 원칙은 **Seed가 코드를 대신 만들지 않는다. Seed가 대신 결정하지 않는다.** Seed는 사용자가 **"무엇을 만들 가치가 있는지" 스스로 발견하도록 돕는다.**

## 1.4 Background (배경)

### 1.4.1 시장/환경 배경

- AI 코딩 도구(Codex, Cursor, Claude Code, Copilot 등)의 폭발적 성장으로 **"아이디어 → 프로토타입"** 전환 비용이 극도로 낮아졌다.
- 결과적으로 **"무엇을 만들지"** 를 결정하는 사고 단계의 중요성이 상대적으로 커졌다. 잘못된 것을 빠르게 만드는 것이 오히려 더 큰 비용이 되는 시대다.
- 기존 AI 도구는 사용자의 한 줄 입력을 받아 **즉시 기능 목록, 코드, 문서를 뱉어내는 방식**이 대부분이다. 생각을 "성장시키는" 과정이 없다.

### 1.4.2 사용자 배경

개발자들은 반복적으로 다음과 같은 상태에 놓인다:

| 상황 | 세부 |
|------|------|
| "뭔가 만들고 싶다" | 막연한 욕구만 있고 출발점이 없다 |
| "아이디어는 있는데" | 핵심이 없고 기능만 잔뜩 붙어 있다 |
| "방향이 너무 많다" | 웹앱? CLI? 확장 프로그램? 선택이 어렵다 |
| "이게 괜찮은지 모르겠다" | 현실성 검증이 안 되어 있다 (경쟁, 시장) |
| "프로젝트가 커졌다" | 아이디어가 감당할 수 없을 정도로 비대해졌다 |
| "방향이 바뀌었다" | 시작 후 목적이 흐려졌거나 달라졌다 |

### 1.4.3 Seed 출시 근거

- LLM 사용이 개발자 워크플로의 일상이 된 현재, **"아이디어를 키우는 전용 공간"** 은 존재하지 않는다. (채팅창은 지속성이 없고, 문서 도구는 대화가 없고, 코드 에이전트는 "만들기"에만 집중한다)
- CLI 기반이므로 **설치 부담이 거의 없고**(`npx seed`), 저장소처럼 `.seed/` 로컬 파일로 모든 상태를 보존할 수 있다.

## 1.5 Product Type & Delivery

| 항목 | 값 |
|------|----|
| 배포 형태 | npm 패키지 (`npx @seed-cli/seed`, `npm i -g @seed-cli/seed`) |
| 실행 환경 | Node.js (CLI) — 터미널, Windows/macOS/Linux |
| 상호작용 방식 | 1회성 명령(one-shot) + 인터랙티브 모드(REPL) **둘 다 지원** |
| 언어 | 영문 UI 기본 + 한국어 지원 (`--lang ko` / `SEED_LANG=ko`), 사용자 입력은 언어 무관 |
| 저장 | 로컬 `.seed/` 디렉터리 (JSON 파일) |
| 라이선스 | 무료 오픈소스 (MIT 또는 Apache 2.0), 후원(sponsor) + 기업 라이선스 옵션 |

---

# 2. Problem (문제 정의)

## 2.1 Problem Statement

> **현대 개발자는 코드를 작성하는 데 걸리는 시간보다, "무엇을 만들어야 하는지"를 이해하고 결정하는 데 더 큰 어려움을 겪는다. 그러나 기존 도구는 그 결정 과정을 돕지 않고, 입력 즉시 산출물(코드/문서)을 뱉어내어 설계되지 않은 아이디어를 조기에 굳혀버린다.**

## 2.2 Current Situation (현재 상황)

- 사용자가 "개발자용 무언가"라고 말하면, 기존 AI 도구는 **첫 응답부터 기능 목록과 기술 스택을 제안**한다.
- 사용자가 "공부 앱"이라고 말하면, 기능이 30개인 로드맵이 즉시 생성된다.
- 이는 **질문 없이 가정만 쌓는** 행위이며, 잘못된 아이디어를 빠르게 굳히는 결과를 낳는다.

## 2.3 User Pain Points (사용자 불편/고통)

| # | Pain Point | 심각도 | 빈도 |
|---|------------|--------|------|
| P1 | 아이디어가 모호해서 시작조차 못 한다 | 높음 | 항상 |
| P2 | 시작했지만 핵심이 무엇인지 불명확 | 높음 | 높음 |
| P3 | 방향 선택(플랫폼/형태)이 어렵다 | 중간 | 자주 |
| P4 | 아이디어의 현실성(사람들이 쓸까?)을 검증 못 한다 | 높음 | 자주 |
| P5 | 아이디어가 계속 비대해져서 통제 불능 | 중간 | 높음 |
| P6 | 진행 중 방향이 흔들려 다시 처음으로 (반복 비용) | 높음 | 가끔 |
| P7 | "왜 이걸 만드는지"의 기록이 남지 않아 나중에 회고 불가 | 중간 | 자주 |

## 2.4 Why Now (왜 지금인가)

- LLM API 비용/성능이 CLI 도구가 실시간 대화형 질문을 주고받기에 충분한 수준에 도달함.
- AI 코딩 에이전트가 대중화되면서, **"에이전트에게 줄 확실한 작업 정의"** (Coding Prompt, PRD)의 가치가 급상승함. Seed는 그 작업 정의를 "성장 과정"을 통해 생산함.
- 개발자 문화에서 CLI 도구(npm 생태계)의 수용성이 매우 높음.

---

# 3. Target Users (타깃 사용자)

## 3.1 Primary User (1차 사용자)

**개발 경험이 적거나 없는 바이브코딩 입문자**

- 프리랜서/개인 프로젝트를 여러 개 병행
- "뭔가 만들어보고 싶다" ↔ "어떻게 구체화하지" 사이의 갭 존재
- 만들고 싶은 것은 있지만 어디서부터 시작할지 막막함
- ChatGPT 같은 AI와 대화하며 아이디어를 정리해 보고 싶음
- 터미널을 처음 써도 안내를 따라갈 수 있어야 함

## 3.2 Secondary Users (2차 사용자)

| 사용자군 | 니즈 |
|----------|------|
| 주니어 개발자 | 아이디어 구체화 방법 자체를 배우고 싶음 (멘토 역할) |
| 학생 / 개발 입문자 | 포트폴리오/과제 주제 선정, 프로젝트 방향 잡기 |
| 사이드 프로젝트 해커 | 여러 아이디어를 실험·발전시키는 취미 개발자 |
| 스타트업 초기 팀원 | 팀 논의 전 1인 초안 정리, 투자논의 전 아이디어 검증 |
| AI Coding Agent 사용자 | 에이전트에게 줄 명확한 작업 지시서(Coding Prompt)가 필요 |

## 3.3 User Context (사용 맥락)

| 맥락 | 설명 |
|------|------|
| 시간 | 프로젝트 시작 전 5~30분, 또는 틈틈이 대화 |
| 장소 | 로컬 터미널 (오프라인 가능, 단 AI 호출 시 온라인 필요) |
| 기기 | 데스크톱/노트북 개발 환경 |
| 감정 상태 | 막연함, 조급함, 호기심, 때로는 아이디어 비대에 대한 부담감 |

## 3.4 Non-users (비타깃)

- 코드만 빠르게 만들고 싶은 사람 (→ 기존 AI 코딩 도구 사용)
- 문서(PRD)만 대량 생산하려는 사람 (→ Seed는 "성장"이 먼저다)
- 협업 기능이 필수인 대기업 팀 (→ Phase 3 대상, MVP 미포함)
- GUI만 선호하는 사용자 (→ Phase 3 Web UI 대상)

---

# 4. Goals (목표)

## 4.1 Primary Goals (제품 핵심 목표)

1. **G1 — 생각의 구체화**: 사용자가 막연한 한 줄에서 시작해, 명확하게 정의된 아이디어(문제/사용자/핵심가치/차별점/범위)에 도달하도록 돕는다.
2. **G2 — 질문 중심 UX**: AI가 정답을 주기보다 **"아이디어가 다음으로 필요로 하는 질문"** 을 던진다.
3. **G3 — 비파괴적 성장**: 사용자의 코드·프로젝트 파일을 절대 수정하지 않는다 (non-destructive).
4. **G4 — 지속적 상태 보존**: 아이디어의 전체 성장 역사(대화, 결정, branch, prune, harvest)를 로컬에 보존한다.
5. **G5 — 필요한 순간에만 수확**: PRD/TRD/README 등은 목적이 아니라 Harvest 단계의 산출물이다.
6. **G6 — 아이디어 비대 방지**: 아이디어가 커지면 Prune을 제안한다.

## 4.2 Secondary Goals (보조 목표)

- 명령어 학습 부담 제거 (첫 실행 `npx seed` 만으로 시작 가능)
- 다양한 AI LLM 제공자 선택의 자유 (벤더 록인 방지)
- 인터랙티브 모드와 원샷 명령어의 일관된 경험
- 아이디어의 "Git History" 같은 성장 기록 제공

## 4.3 Non-goals (MVP에서 하지 않을 것)

| 항목 | 이유 |
|------|------|
| 코드 자동 작성/수정 | 제품 철학 위배 (Seed는 Gardener다) |
| 자동 구현 (프로젝트 생성) | 제품 철학 위배 |
| 사용자 대신 의사결정 | Rule 7 (명시적 결정 vs AI 추론 구분) |
| 웹 대시보드 | Phase 3 |
| 실시간 협업 | Phase 3 |
| 모바일 앱 | Phase 3 |
| 팀 계정/청구 | Phase 3 |
| 음성 인터페이스 | 미정 (Open Question) |

---

# 5. Core User Experience (핵심 사용자 경험)

## 5.1 Main User Journey (메인 여정)

```text
[1] 시작      : npx seed → "What is on your mind?" (아이디어 한 줄)
[2] 심기      : Seed 생성 (성숙도 0~10%, 상태 seedling)
[3] 성장      : grow/water 반복 (질문-답변, 요약 갱신)
[4] 가지치기  : branch로 방향 실험 → prune로 범위 정리
[5] 현실 검증 : sunlight로 시장/경쟁/제약 점검
[6] 개화      : bloom으로 성숙도 확인 (82% 이상 권장)
[7] 수확      : harvest로 PRD/TRD/README/Coding Prompt 생성
[8] 보존      : wither로 휴면 → wake로 재성장 (선택)
```

## 5.2 Core Loop (핵심 루프)

```text
AI가 현재 Seed 상태를 읽는다
   ↓
가장 필요한 질문 1~3개를 결정한다
   ↓
사용자가 답한다
   ↓
AI가 답변을 반영해 아이디어 요약을 갱신한다
   ↓
(모순/빈틈/비대 발견 시) 알려준다
   ↓
다음 질문으로 반복한다
```

**핵심 성공 판단 문장 (AI 매 순간 기준):**
> 단순히 "무엇을 출력할까(What should I output?)"가 아니라 **"이 아이디어가 지금 가장 필요로 하는 것은 무엇일까(What does this idea need next?)"**

## 5.3 첫 실행 UX (First-run Experience)

```text
$ npx seed

🌱 Welcome to Seed.

You don't need a perfect idea.
Just plant something.

What is on your mind?
>
```

- **대화 시작까지 어려운 설정 0회.** 단, AI Provider 설정이 안 되어 있으면 설정 가이드로 안내 (→ 7장 참조)
- 기존 Seed 존재 시 안내: "이미 🌱 RepoLens (82%) 가 있어요. 새로 심으시겠어요? 아니면 /garden으로 돌아갈까요?"

## 5.4 최소 시작 시나리오 (Zero-to-Harvest)

```text
$ npx seed "개발자를 위한 음악 앱을 만들고 싶어"
🌱 A new seed has been planted. (성숙도 5%)
💧 Let's grow it.
Q) 어떤 점이 Spotify와 다른가요?
> 개발자들이 코딩할 때 집중을 도와주는 사운드스케이프
🌱 Growth update: "..."
[반복...]
🌸 BLOOM CHECK — Overall maturity: 87%
🍎 HARVEST → 1. Idea Card / 2. PRD / 3. TRD ...
```

---

# 6. Product Features (기능 명세)

## 6.1 기능 총괄 테이블

| # | 명령어 | 이름 | 계층 | MVP | Phase 2 | 구현 상태 |
|---|--------|------|------|-----|---------|
| 1 | `seed` | 심기/시작 | Plant | ✅ | — | ✅ 구현됨 |
| 2 | `grow` | 성장 (질문) | Grow | ✅ | — | ✅ 구현됨 |
| 3 | `water` | 관점 공급 | Grow | ❌ | ✅ | ✅ 구현됨 |
| 4 | `branch` | 가지 뻗기 | Grow | ✅ | — | ✅ 구현됨 |
| 5 | `prune` | 가지치기 | Shape | ✅ | — | ✅ 구현됨 |
| 6 | `sunlight` | 현실 검증 | Shape | ❌ | ✅ | ✅ 구현됨 |
| 7 | `tree` | 구조 보기 | Shape | ✅ | — | ✅ 구현됨 |
| 8 | `evolve` | 진화 | Shape | ❌ | ✅ | ✅ 구현됨 |
| 9 | `bloom` | 성숙도 검사 | Bloom | ✅ | — | ✅ 구현됨 |
| 10 | `harvest` | 수확 | Harvest | ✅ | — | ✅ 구현됨 |
| 11 | `garden` | 여러 Seed 관리 | Support | ❌ | ✅ | ✅ 구현됨 |
| 12 | `history` | 성장 기록 | Support | ✅ | — | ✅ 구현됨 |
| 13 | `wither` | 휴면 | Support | ❌ | ✅ | ✅ 구현됨 |
| 14 | `wake` | 재성장 | Support | ❌ | ✅ | ✅ 구현됨 |
| 15 | `config` | 설정 (AI Provider 등) | Support | ✅ | — | ✅ 구현됨 |
| 16 | `restore` | Prune 복구 | Support | ❌ | ✅ | ✅ 구현됨 |
| 17 | `merge` | Branch 결합 | Support | ❌ | ❌(후속) | ❌ 미구현 (Phase 3) |

## 6.2 공통 규칙 (모든 명령어)

- **위치 독립성**: 명령 실행 위치의 현재 디렉터리에서 `.seed/` 를 찾고, 없으면 상위로 탐색하거나 새로 생성한다.
- **멀티 Seed**: Seed가 1개만 있으면 기본 대상으로 자동 선택. 여러 개면 선택 프롬프트.
- **인자**: 대부분 인자 없이 인터랙티브 실행. 단 `seed "아이디어"`는 예외(직접 심기).
- **취소**: `Ctrl+C` / `/exit` / `--no-input` 지원.
- **오프라인**: AI 호출이 실패해도 성장 질문·요약은 내장 local fallback으로 이어가며, 웹 검색만 선택적으로 건너뛴다.
- **출력**: 색상 · 이모지 · 스피너 · 인터랙티브 선택 지원. `--json` 플래그로 기계 판독 출력 지원 (스크립트 용).

---

## 6.3 FEATURE F-01 — `seed` (Plant / 시작)

### 목적
새 아이디어를 씨앗으로 심는다. 최초 진입점.

### 입력
- (선택) 아이디어 텍스트 인자: `npx seed "개발자를 위한 음악 앱"`
- (선택) 인터랙티브 입력 프롬프트

### 처리
1. 아직 아이디어가 없으면 인사말 + `What is on your mind?` 출력
2. 아이디어 수신 → 새로운 Seed 생성
3. 저장 필드:
   - 원본 입력(originalIdea), 생성 시각, 현재 요약(coreIdea), 상태(seedling), 성숙도(0~10)
   - 대화 기록 초기화

### 출력 예시
```text
🌱 A new seed has been planted.
Let's grow it.

What makes existing projects difficult to understand?
```

### 수락 기준 (AC)
- [ ] AC-F01-1: 인자 없이 실행 시 프롬프트가 뜬다
- [ ] AC-F01-2: 한 줄 아이디어로 Seed가 생성되고 `.seed/seed.json`에 저장된다
- [ ] AC-F01-3: 초기 상태는 `seedling`, 성숙도 0~10%
- [ ] AC-F01-4: 생성 직후 첫 grow 질문이 자동으로 이어진다

---

## 6.4 FEATURE F-02 — `grow` (Grow / 질문 성장)

### 목적
아이디어를 대화로 성장시킨다. **Seed의 핵심 기능.**

### 입력
- (선택) `--seed <id|name>` 대상 지정
- (선택) `--no-interactive` + `--answer "..."` (스크립트용)

### 처리 (Growth Engine)
1. 현재 Seed State 읽기 (요약, 결정, open questions, 최근 대화)
2. AI가 다음 결정:
   - 가장 필요한 질문 1~3개 생성
   - 질문 생성 근거: 빈 정보 / 모순 / 비대한 부분 / 사용자 흥미 / 검증 필요 항목
3. 질문 출력 → 사용자 답변 수신
4. AI가 답변을 요약에 반영 (ideas update)
5. 히스토리에 conversation 저장
6. 필요 시 다음 질문 계속 (기본 1턴씩)

질문이 어렵거나 사용자가 `다른 질문`, `잘 모르겠어`, `rephrase`, `skip`처럼
대화 진행을 요청하면 해당 문장은 아이디어 근거로 저장하지 않는다. 현재 질문을
취소하고 같은 성장 초점을 유지한 새 질문을 제시한다. 빈 Enter는 질문을 열린
상태로 남긴 채 세션만 잠시 멈춘다. `잠깐 생각해볼게`나 `I'll answer later` 같은
표현도 같은 pause 동작으로 처리한다.

질문 변경 요청 다음에는 사람·상황·행동·결과 중 하나만 묻는 구체적인 질문을
우선한다. 바로 답하기 어려운 추상적인 표현을 다시 반복하지 않는다.

개발 경험이 없는 사용자도 이해할 수 있도록 질문·요약에는 일상어를 사용한다.
`가정`, `검증`, `스코프`, `시그널`처럼 제품 용어가 필요한 경우에는 쉬운 말로
바꿔 묻는다. 사용자가 왜 묻는지 모르겠다고 하거나 답변 방법을 모르겠다고 말해도
이를 아이디어 내용으로 추측하지 않고, 질문의 목적을 짧게 설명한 뒤 더 쉬운 질문으로
이어간다.

명확한 제어 표현으로 판단하기 어려운 입력은 선택된 AI가 답변인지, 질문을 바꿔 달라는
도움 요청인지, 잠시 멈추려는 말인지 구분한다. 판단에 실패하면 사용자의 문장을
그대로 답변으로 보존해 생각을 잃지 않는다.

### 성장 갱신 출력 예시
```text
🌱 Growth update
Before: "개발자를 위한 음악 앱"
Now:    "A music experience designed around focused coding sessions."
```

### 로직 규칙
- 고정 설문지가 아님. **매 턴 상태 기반 동적 질문**
- 한 질문이 너무 많은 정보를 요구하면 안 됨 (Rule 2)
- 사용자 답변은 반드시 요약에 반영 (Rule 3)
- 모순 발견 시 즉시 알림 (Rule 4)

### 수락 기준 (AC)
- [ ] AC-F02-1: Seed 상태를 기반으로 질문이 생성된다 (고정 프롬프트 아님)
- [ ] AC-F02-2: 답변 → 요약 갱신 → 대화 저장이 정상 동작한다
- [ ] AC-F02-3: 성숙도가 소폭 상승한다 (정보 수집량에 비례)
- [ ] AC-F02-4: 성장 이전/이후 요약이 표시된다
- [ ] AC-F02-5: 비대한 아이디어 감지 시 prune 제안을 할 수 있다
- [ ] AC-F02-6: 질문 변경/재표현 요청은 아이디어에 반영하지 않고 새 질문으로 자연스럽게 이어진다

---

## 6.5 FEATURE F-03 — `water` (Grow / 관점 공급) [Phase 2]

### 목적
직접 질문 대신 **다양한 관점**을 공급해 아이디어를 확장한다.

### 처리
AI가 여러 "렌즈"를 제시:

```text
💧 Let's water your idea.
👤 User      : What would make someone use this every day?
💰 Business  : Could anyone pay for this?
⚙️ Technical : What makes this technically interesting?
🎨 Experience: What should the first 30 seconds feel like?
```

- 각 관점별 최소 1개 씩 새로운 시각 제시
- 사용자가 특정 관점을 골라 심화 대화 가능
- 결과는 research/notes로 저장 (open question이 아님)

### 수락 기준 (AC)
- [ ] AC-F03-1: 최소 4개 이상의 관점이 제시된다
- [ ] AC-F03-2: 관점 선택 후 심화 대화가 가능하다
- [ ] AC-F03-3: 산출 내용이 `.seed/research/`에 보존된다

---

## 6.6 FEATURE F-04 — `branch` (Grow / 가지 뻗기)

### 목적
하나의 아이디어에서 **여러 독립적인 방향**을 만든다.

### 입력
- `npx seed branch` — AI가 방향 제안
- `npx seed branch <index|name>` — 특정 branch 선택/생성
- `npx seed branch list` (설계상 유용) — branch 목록

### 처리
1. 현재 coreIdea를 읽고 2~4개의 방향(대안) 제안 (각각 이름+요약)
2. 사용자 선택 → 독립 Branch 생성
   - Branch는 원본을 수정하지 않는다 (독립 경로)
   - 각 branch별: summary, assumptions, decisions, openQuestions, maturity, parentBranch, createdAt
3. 이후 `grow`를 해당 branch에 대해 수행 가능 (`--branch <id>`)

### 출력 예시
```text
🌿 Your seed can grow in several directions.
A. Repository Explorer
B. AI Code Teacher
C. Project Onboarding
D. Architecture Visualizer

> 1
🌿 Growing branch: Repository Explorer
```

### 수락 기준 (AC)
- [ ] AC-F04-1: 2~4개 방향이 제안된다
- [ ] AC-F04-2: branch 생성 시 원본 seed 상태가 그대로 유지된다
- [ ] AC-F04-3: branch 대상으로 grow가 가능하다
- [ ] AC-F04-4: 허용 범위 초과 시 "너무 많은 branch" 안내 (권장 최대 5개 활성 branch)

---

## 6.7 FEATURE F-05 — `prune` (Shape / 가지치기)

### 목적
비대해진 아이디어에서 **필요 없는 가지를 제거**하고 MVP 범위를 정리한다.

### 입력
- `npx seed prune` — AI가 제거 후보 제안
- `npx seed prune --branch <id>` — 특정 가지 지정

### 처리
1. 현재 아이디어 구조 읽기 → 비대/비핵심 후보 제안
2. 각 후보에 제거 이유 표시
3. 사용자가 제거할 항목 선택 (다중 선택 가능)
4. **제거된 가지는 실제 삭제하지 않고 `status: pruned`로 유지** (history에서 확인, restore 가능)
5. "핵심이 무엇인가" 재강조 문구 노출

### 출력 예시
```text
✂️ PRUNING
Possible branches to remove:
✂ Social features
✂ Mobile application
✂ Team collaboration

Your strongest core appears to be:
"Helping developers understand unfamiliar repositories."
```

### 수락 기준 (AC)
- [ ] AC-F05-1: 제거 후보와 이유가 제시된다
- [ ] AC-F05-2: 사용자 선택에 따라 pruned 처리된다 (삭제 아님)
- [ ] AC-F05-3: prune 이력이 history에 기록된다
- [ ] AC-F05-4: prune 후 MVP 범위(scope) 요약이 갱신된다
- [ ] AC-F05-5: 잘못 prune 시 restore 가능하다 (Phase 2, 설계 보장)

---

## 6.8 FEATURE F-06 — `sunlight` (Shape / 현실 검증) [Phase 2]

### 목적
아이디어를 **외부 현실(사용자/시장/경쟁/기술)** 에 비춰본다.

### 입력
- `npx seed sunlight`
- (선택) `--web` — 웹 검색 사용
- (선택) `--no-web` — 검색 없이 AI 지식만

### 분석 영역
| 영역 | 예시 질문 |
|------|-----------|
| 사용자 | 누가 진짜 쓸까? 지금 뭘 쓰고 있나? |
| 경쟁 제품 | 어떤 대안이 이미 존재하나? |
| 기존 해결 방법 | 지금은 어떻게 해결하나? |
| 차별점 | 왜 바꿔야 하나? |
| 시장 상황 | 시장 규모/성장, 최신 트렌드 |
| 비용 | 얼마나 들고, 감당 가능한가 |
| 현실 제약 | 법/인프라/리소스 제약 |
| 기술 현실성 | 기술적으로 가능한가 |

### 원칙 (Research Rules)
- 검색 결과를 **사실로 단정하지 않음** (추정과 구분 표시)
- 출처 저장: source, title, summary, retrievedAt, relevance
- 사용자 의견 vs 외부 사실 분리
- 오래된 정보 vs 최신 정보 구분
- 경쟁 제품의 실제 존재 여부 확인

### 출력 예시
```text
☀️ SUNLIGHT

[사용자 검증]
- 누가: 개발자, 주니어~시니어
- 오늘날 무엇을 쓰나: IDE + GitHub + Stack Overflow

[경쟁]
- 실제 존재: RepoExplorer(가칭) — 유사 도구 확인됨
- 차별점 제안: 온보딩 중심 대화형 UX

[제약]
⚠ 오픈소스 라이선스 이슈 가능성 (Open Question으로 등록)
```

### 수락 기준 (AC)
- [ ] AC-F06-1: 최소 3개 영역이 분석된다
- [ ] AC-F06-2: 사실/추정이 구분 표시된다
- [ ] AC-F06-3: `--web` 사용 시 출처가 저장된다 (`research/` 폴더)
- [ ] AC-F06-4: 결과가 Seed 상태(assumptions, openQuestions)에 반영된다

---

## 6.9 FEATURE F-07 — `tree` (Shape / 시각화)

### 목적
아이디어의 **전체 구조**와 각 가지의 상태를 트리로 보여준다.

### 처리
- 현재 Seed의 구조(핵심/하위 개념)를 트리 렌더링
- (선택) `--all` : pruned/dormant 포함 모두 표시
- (선택) `--branch <id>` : 특정 branch만 표시
- (선택) `--json` : 구조화 출력

### 출력 예시
```text
🌳 IDEA TREE

🌱 Developer Tool
│
├── 🌿 Understand Code
│   ├── 🍃 Repository
│   ├── 🍃 Architecture
│   └── 🍃 Execution Flow
│
├── 🌿 Learn Code
│   ├── 🍃 Tutorials
│   └── 🍃 Explanations
│
└── 🌿 Onboarding ⭐
    ├── 🍃 Developer Tour
    ├── 🍃 Ask Questions
    └── 🍃 Git History
```

### 수락 기준 (AC)
- [ ] AC-F07-1: 트리가 이모지/인덴트로 가독성 있게 렌더링된다
- [ ] AC-F07-2: `--all`로 pruned/dormant 포함 표시 가능
- [ ] AC-F07-3: `--json`으로 파싱 가능한 출력 제공
- [ ] AC-F07-4: ⭐ 표시로 현재 초점(active branch)을 표시한다

---

## 6.10 FEATURE F-08 — `evolve` (Shape / 진화) [Phase 2]

### 목적
성장한 아이디어를 **다음 세대의 새로운 아이디어**로 발전시킨다.

### Branch vs Evolve 차이
| 구분 | Branch | Evolve |
|------|--------|--------|
| 대상 | 현재 아이디어 내부의 갈래 | 현재 아이디어 자체의 다음 단계 |
| 결과 | 병렬 가지들 | 세대를 잇는 새 아이디어 |
| 유사성 | 대안 탐색 | 진화/확장 |

### 처리
1. 현재 아이디어 요약 → 2~4개 진화 방향 제안 (예: CLI → VS Code 확장)
2. 사용자 선택 → 기존 아이디어를 부모로 한 **새 세대 Seed 생성**
   - 원본은 그대로 유지, `parentIdea` 링크 저장
3. 진화체는 독립 seed로 취급되어 다시 grow 가능

### 수락 기준 (AC)
- [ ] AC-F08-1: 2~4개 진화 방향 제안
- [ ] AC-F08-2: 선택 시 부모-자식 관계로 새 seed 생성
- [ ] AC-F08-3: 원본 seed는 변경되지 않는다

---

## 6.11 FEATURE F-09 — `bloom` (Bloom / 성숙도 검사)

### 목적
아이디어가 **만들 준비가 되었는지**를 검사한다. 단순 점수 부여가 아니다.

### 평가 항목 (Maturity Dimensions)
| 항목 | 설명 |
|------|------|
| Problem clarity | 문제가 명확한가 |
| User clarity | 사용자가 명확한가 |
| Core value | 핵심 가치가 명확한가 |
| Differentiation | 차별점이 명확한가 |
| Scope | 범위가 적절한가 |
| Feasibility | 실현 가능한가 |
| Motivation | 동기가 충분한가 |
| Confidence | 전반적 확신도 |

### 처리
1. Seed 상태 종합 → 각 항목 0~100% 점수 산출
2. **전체 점수만 보여주지 않고** 다음 3가지를 항상 함께 제공:
   - What is clear (명확한 것)
   - What is uncertain (불확실한 것)
   - What should be explored (탐색할 것)
3. 주의: 수치는 **UX용 지표**이지 과학적 점수가 아님을 표시
4. 미성숙 시 → 부족한 항목 특정 후 해당 grow 제안
5. Open Question이 중요한 상태로 남아있으면 점수 하향 반영

### 출력 예시
```text
🌸 BLOOM CHECK

Problem             ██████████ 92%
User                █████████░ 86%
Core Value          ██████████ 94%
Differentiation     ██████░░░░ 61%
Scope               ████████░░ 79%
Feasibility         ████████░░ 81%

Overall maturity: 82%

Clear: ✓ Problem  ✓ User  ✓ Core
Unclear: ⚠ Differentiation  ⚠ Scope
Recommendation: grow differentiation once more.
```

### 성숙도 구간
```text
0-20   🌱 Seedling
21-40  🌿 Growing
41-60  🌳 Developing
61-80  🌸 Near Bloom
81-100 🌸 Mature
```

### 수락 기준 (AC)
- [ ] AC-F09-1: 8개(또는 6개) 평가 항목 점수 + overall 산출
- [ ] AC-F09-2: Clear/Uncertain/Explore 3요소가 항상 포함된다
- [ ] AC-F09-3: 80% 미만 시 부족 항목 grow 제안
- [ ] AC-F09-4: "UX 지표"임을 사용자에게 고지한다

---

## 6.12 FEATURE F-10 — `harvest` (수확)

### 목적
성장한 아이디어에서 **실제 산출물**을 만든다. **목적이 아니라 결과다.**

### 하위 산출물
| 선택 | 명령어 | 결과물 | MVP |
|------|--------|--------|-----|
| 1 | `harvest idea` | Idea Card (한 장) | ✅ |
| 2 | `harvest brief` | 한 페이지 요약 | ✅ (간단형) |
| 3 | `harvest prd` | Product Requirements Document | ✅ |
| 4 | `harvest trd` | Technical Requirements Document | ✅ |
| 5 | `harvest readme` | README.md | Phase 2 |
| 6 | `harvest prompt` | AI Coding Agent용 작업 지시서 | Phase 2 |
| 7 | `harvest all` | 전부 (idea/brief/prd/trd/readme/prompt) | — |

### 처리
1. 수확 종류 선택 (인터랙티브 또는 인자)
2. 기존 harvest 산출물 있으면 **덮어쓰지 않고 버전 관리**
   - `harvest/prd-v1.md`, `prd-v2.md` 또는 날짜 폴더 `harvest/2026-08-29/prd.md`
3. 저장 위치: `.seed/harvest/`
4. PRD/TRD 생성 시 알 수 없는 항목은 `TBD` 또는 `Open Question`으로 표시 (AI 임의 사실 생성 금지)

### 수락 기준 (AC)
- [ ] AC-F10-1: 7종 수확 선택이 가능하다
- [ ] AC-F10-2: 기존 결과물은 버전/날짜로 충돌 없이 저장된다
- [ ] AC-F10-3: 알 수 없는 항목은 TBD/Open Question 처리된다
- [ ] AC-F10-4: harvest 결과가 history에 기록된다

---

## 6.12.1 FEATURE F-10a — `harvest idea`

### 목적
가장 빠른 한 장의 Idea Card.

### 구조
```markdown
# [Product Name]

## One-line Idea
...

## Target User
...

## Problem
...

## Core Experience
...

## Key Insight
...
```

### AC
- [ ] 1장 분량, 마크다운으로 저장

---

## 6.12.2 FEATURE F-10b — `harvest brief`

### 목적
PRD보다 짧은 한 페이지 요약.

### 구조
- 아이디어 한 줄 / 문제 / 사용자 / 핵심 경험
- 주요 기능 / 범위 / 차별점 / MVP

---

## 6.12.3 FEATURE F-10c — `harvest prd`

### 목적
축적된 대화·결정·branch·prune·sunlight·bloom 결과를 **공식 PRD**로 변환.

### 구조 (필수 섹션)
```markdown
# Product Requirements Document
## 1. Product Overview (name/one-line/vision/background)
## 2. Problem (statement/current situation/pain points)
## 3. Target Users (primary/secondary/context)
## 4. Goals (primary/secondary/non-goals)
## 5. Core UX (main journey/flows)
## 6. Product Features (각 feature별 상세)
## 7. MVP Scope (must/should/future)
## 8. Differentiation (alternatives/why us/unique value)
## 9. UX Principles
## 10. Success Criteria
## 11. Risks
## 12. Future Opportunities
## 13. Open Questions
```

---

## 6.12.4 FEATURE F-10d — `harvest trd`

### 목적
PRD를 **기술 구조**로 변환. Seed는 구현하지 않지만 기술 정의서를 제공.

### 구조 (필수 섹션)
```markdown
# Technical Requirements Document
## 1. Technical Overview
## 2. Architecture
## 3. Technology Stack
## 4. Runtime Environment
## 5. Data Model
## 6. Application Structure
## 7. External Services
## 8. AI / LLM Architecture
## 9. State Management
## 10. Storage
## 11. CLI Architecture
## 12. Configuration
## 13. Authentication
## 14. Error Handling
## 15. Security Considerations
## 16. Performance Considerations
## 17. Testing Strategy
## 18. Deployment
## 19. Observability
## 20. Technical Risks
## 21. Future Scalability
```

---

## 6.12.5 FEATURE F-10e — `harvest readme` [Phase 2]

프로젝트 소개용 README 생성.
구성: Name / Description / Why / Features / Usage / Installation / Examples / Architecture / Development / License

---

## 6.12.6 FEATURE F-10f — `harvest prompt`

### 목적
다른 AI Coding Agent(Claude Code, Cursor 등)에 넘길 **명확한 작업 지시서**를 생성.
**Seed가 코드를 만드는 것이 아니다.**

### 구조
```text
You are implementing [Product].
Context: ...
Goals: ...
Expected behavior: ...
Constraints: ...
Acceptance criteria: ...
```

---

## 6.13 FEATURE F-11 — `config` (설정) ★ 사용자 추가 요구사항

> **중요: 이 섹션은 사용자가 명시적으로 요청한 추가 요구사항임.**
> "처음 세팅할 때 무슨 AI 사용할지. OpenAI는 계정연동과 API, Gemini/Claude 같은 건 API, 기타 등등은 프로바이더 추가 가능하게. 이건 설정 가능하게."

### 6.13.1 목적
- 첫 사용자가 **어떤 AI를 쓸지 선택**하고 연결 방식을 설정한다.
- 특정 벤더에 종속되지 않도록 **Provider abstraction**을 제공한다.
- 이후에도 자유롭게 Provider를 추가/교체/삭제할 수 있다.

### 6.13.2 명령어
```bash
npx seed config            # 인터랙티브 설정 마법사
npx seed config list       # 현재 설정/프로바이더 목록
npx seed config use <name> # 활성 프로바이더 전환
npx seed config set <key> <value>   # 개별 속성
npx seed config remove <name>       # 프로바이더 삭제
npx seed config test       # 현재 프로바이더 연결 테스트
```

### 6.13.3 설정 흐름 (첫 실행 / config 마법사)

```text
🌱 Which AI provider would you like to use?

  1. OpenAI          — 계정 연동 또는 API 키
  2. Google Gemini   — API 키 (Google AI Studio)
  3. Anthropic Claude — API 키
  4. Custom Provider — 직접 추가 (Base URL + API Key + 모델)
  5. Local fallback  — 외부 자격 증명 없이 로컬 규칙 엔진
```

- 선택 → 연결 방식 입력 → **연결 테스트 실행** → 성공 시 기본(active) 프로바이더로 저장
- **프로바이더 추가/전환은 언제든 가능** (프로젝트별로 다른 프로바이더 지정 가능)

### 6.13.4 지원하는 연결 방식 (Connection Modes)

| Provider | 지원 방식 | 입력값 | 비고 |
|----------|-----------|--------|------|
| OpenAI | ① 계정 연동 (OAuth flow) | `seed config login openai` 브라우저 인증 | Cloud Sync 준비 단계 (Phase 3 시드) |
| OpenAI | ② API Key | `sk-...` | 가장 일반적 |
| Google Gemini | API Key | `AIza...` | google-auth-library |
| Anthropic Claude | API Key | `sk-ant-...` | |
| Custom/OpenAI-compatible | Base URL + API Key + Model | 예: OpenRouter, Groq, vLLM 등 | OpenAI 호환 엔드포인트 재사용 |
| Local fallback | 외부 연결 없음 | 규칙 기반 질문·요약 | 오프라인 기본 제공 |

**핵심 원칙:**
- **OpenAI는 계정 연동(브라우저 OAuth)과 API 키 두 가지 방식을 모두 지원**한다.
- **Gemini / Anthropic Claude / 기타는 API 키 방식**을 기본 지원한다.
- 그 외의 모든 LLM 서비스는 **Custom Provider (Base URL + API Key + Model)** 로 추가 가능하다. → 사실상 무제한 확장.
- 각 프로바이더는 **id, name, type, baseUrl, defaultModel, temperature, maxTokens, enabled, connectionMode**를 가진다. API 키는 설정 파일에 저장하지 않고 환경변수로, OAuth 자격 증명은 프로젝트 밖의 Seed OAuth 파일로 관리한다.

### 6.13.5 설정 저장 구조 (사용자 수준)
- 전역 설정: `~/.seed/config.json` (프로바이더·모델·언어만 저장, API 키는 저장하지 않고 환경변수로만 주입)
- 프로젝트 설정: `.seed/config.json` (프로바이더 선택 등 전역 설정의 오버라이드)
- 프로젝트 안에서 `seed config` 변경 명령을 실행하면 프로젝트 오버라이드에 저장하고, 프로젝트 밖에서는 전역 설정에 저장한다.
- **보안 원칙:**
  - API Key는 평문으로 `.seed/`나 설정 파일에 저장하지 않는다.
  - MVP에서는 provider별 환경변수(`SEED_OPENAI_API_KEY`, `OPENAI_API_KEY` 등)만 읽고, 키체인·암호화 저장은 구현 범위에 포함하지 않는다.
  - `seed config list`에는 키를 출력하지 않으며, `seed config test`는 키 존재 여부와 실제 연결만 확인한다.

### 6.13.6 멀티 프로바이더 정책
| 상황 | 동작 |
|------|------|
| 활성 프로바이더 1개 | 기본 사용 |
| 특정 명령에 프로바이더 지정 | `npx seed grow --provider openai --model gpt-5.6-luna` |
| 활성 프로바이더 실패 | 명확한 오류 + 다른 프로바이더 전환 제안 |
| 비용/속도/품질 비교 | `npx seed config bench` (선택, Phase 2) — 동일 프롬프트로 비교 |

### 6.13.7 수락 기준 (AC)
- [ ] AC-F11-1: 첫 실행 시 프로바이더 선택 마법사가 뜬다
- [ ] AC-F11-2: OpenAI 계정 연동(OAuth)과 API Key 두 방식 모두 연결 가능
- [ ] AC-F11-3: Gemini/Anthropic Claude API Key 방식으로 연결 가능
- [ ] AC-F11-4: Custom Provider(Base URL+Key+Model)로 임의 서비스 추가 가능
- [ ] AC-F11-5: 연결 테스트(`config test`)를 통과해야 저장된다
- [ ] AC-F11-6: 활성 프로바이더 전환이 즉시 반영된다
- [ ] AC-F11-7: API Key가 평문 저장되지 않는다
- [ ] AC-F11-8: 프로바이더 목록 확인/삭제가 가능하다
- [ ] AC-F11-9: 명령어별 프로바이더/모델 오버라이드(`--provider`, `--model`)가 가능하다
- [ ] AC-F11-10: `seed config set lang ko`로 언어 설정이 가능하다 (OQ6 결정 반영)

---

## 6.14 FEATURE F-12 — `garden` (Support / 정원 보기) [Phase 2]

### 목적
여러 Seed를 한눈에 관리한다.

### 처리
- 모든 seed 나열: 이름, 상태, 성숙도, 최근 활동일
- 선택 진입 (해당 seed의 grow/tree 등): 번호·이름·ID·경로를 지정하면 해당 Seed 작업공간으로 들어가며, `/exit`로 이전 작업공간에 돌아온다. JSON/비대화형 실행에서는 선택한 Seed 정보만 출력한다.

### 출력 예시
```text
🌱 YOUR GARDEN
🌸 RepoLens     Mature: 92%
🌳 DevMusic     Growing: 61%
🌱 GameTracker  Seedling: 14%
🍂 Social CLI   Dormant
```

---

## 6.15 FEATURE F-13 — `history` (Support / 성장 기록)

### 목적
아이디어의 **Git History** 같은 변화 기록을 보여준다.

### 처리
- time-ordered 이벤트 나열 (plant, water, grow Q/A, branch, prune, sunlight, bloom, harvest, evolve, wither, wake)
- (선택) `--json`, `--limit`, `--since`
- 아이디어 버전(raw idea → v1 → v2 → v3)을 볼 수 있어야 함

### 출력 예시
```text
📜 GROWTH HISTORY
Day 1 🌱 "개발자에게 유용한 도구"
Day 1 💧 "프로젝트 이해가 어렵다"
Day 1 🌿 Branch: Repository Explorer
Day 2 ✂️ Removed: Social Features
Day 2 ☀️ Competitor analysis
Day 3 🌸 Bloom
Day 3 🍎 Harvested PRD
```

---

## 6.16 FEATURE F-14 — `wither` / `wake` (Support) [Phase 2]

### wither
- 아이디어를 **삭제하지 않고** 휴면(dormant) 상태로 전환
- 확인 프롬프트 `[y/n]` 필수

### wake
- 휴면 seed 재성장
- "마지막 성장: 42일 전. 그 사이 무엇이 바뀌었나요?" → grow 이어가기
- 과거 대화와 현재 상황 비교 컨텍스트 구성

---

## 6.17 FEATURE F-15 — `restore` (Support) [Phase 2]

- pruned된 가지를 다시 활성화
- `npx seed restore` 또는 `npx seed tree --all`에서 선택
- pruned 데이터가 유지되어야 가능

---

## 6.18 FEATURE F-16 — `merge` (후속) [Phase 3 예정]

- 두 branch의 장점 결합 → 결합 방향 생성
- MVP 제외 (설계만: `npx seed merge <a> <b>`)

---

## 6.19 FEATURE F-17 — 다국어 UX (i18n) ★ 사용자 추가 요구사항 (OQ6)

> **OQ6 결정 (2026-08-29): 영어 + 한국어 지원. 기본 언어는 영어. 사용자 입력은 언어 무관.**

### 6.19.1 목적
- 모든 터미널 UX 문구(메시지, 프롬프트, 도움말, 배너, 에러)를 언어별로 제공
- **기본은 영어**, 한국어는 명시적 선택 시
- AI가 생성하는 콘텐츠(질문/요약)는 사용자가 입력한 언어를 따라감 (UX 문구와 분리)

### 6.19.2 언어 선택 방법

| 방법 | 예시 | 우선순위 |
|------|------|----------|
| 명령어 플래그 | `npx seed grow --lang ko` | 최고 |
| 환경변수 | `SEED_LANG=ko npx seed` | 높음 |
| 설정 파일 | `seed config set lang ko` (전역 `~/.seed/config.json`) | 중간 |
| 시스템 감지 | 호스트 로케일과 무관하게 자동 적용하지 않음 (영어 기본 유지) | 낮음 |
| 기본값 | `en` | 기본 |

### 6.19.3 지원 범위 (MVP)

| 항목 | 영어 (en) | 한국어 (ko) |
|------|-----------|-------------|
| 배너/인사말 (`🌱 Welcome to Seed`) | ✅ | ✅ |
| 명령어 도움말 (`--help`) | ✅ | ✅ |
| 모든 고정 프롬프트/메시지 | ✅ | ✅ |
| 에러 메시지 | ✅ | ✅ |
| 인터랙티브 메뉴/선택지 | ✅ | ✅ |
| AI 질문/요약 (사용자 입력 언어 따라감) | — | — (언어 무관) |
| Harvest 결과물 (PRD/TRD 등) | ✅ (기본) | ✅ (`--lang ko` 시) |

### 6.19.4 구현 원칙 (기술 상세는 TRD §25 참조)
- 모든 UI 문자열은 하드코딩 금지, 언어 팩(`i18n/en.json`, `i18n/ko.json`)에서 로드
- 문자열 키 기반: `t('welcome.message')`
- 변수/플레이스홀더 지원: `t('growth.update', { before, after })`
- 구조화된 UI 문자열 (renderer/prompts) 전부 i18n 경유
- **AI 프롬프트는 언어 무관** (모델이 사용자 입력 언어로 답변)
- Harvest 문서 생성 언어는 `--lang` 옵션으로 제어

### 6.19.5 수락 기준 (AC)
- [ ] AC-F17-1: `--lang ko` 실행 시 모든 고정 UX 문구가 한국어로 표시된다
- [ ] AC-F17-2: 기본 실행(플래그 없음) 시 영어로 표시된다
- [ ] AC-F17-3: `SEED_LANG` 환경변수가 동작한다
- [ ] AC-F17-4: 한국어 사용자가 한국어로 아이디어를 입력하면 AI 질문이 한국어로 이어진다
- [ ] AC-F17-5: `--help`가 선택 언어로 표시된다
- [ ] AC-F17-6: 알 수 없는 언어 요청 시 영어로 폴백(fallback)한다

---

# 7. AI (LLM) 요구사항

## 7.1 AI의 역할 제약 (Gardener 원칙)

**AI(Gardener)가 해야 하는 것:**
- 질문하기 / 듣기 / 사용자 생각 요약 / 모순 발견 / 빈 부분 찾기
- 새로운 관점 제공 / 여러 방향 제시 / 비대 경고 / 불필요한 부분 제거 제안
- 현실적 위험 안내 / 성숙도 판단 / 결과물 정리

**AI가 하지 말아야 하는 것:**
- 무조건 칭찬 / 사용자 대신 결정 / 무조건 기능 추가 / 무조건 최신 기술
- 코드 수정 / 프로젝트 파일 수정

## 7.2 AI 대화 스타일

- 정원사(Gardener) 어조: 격려보다 **돌보는** 어조
- 좋은 예: `💧 Let's give this idea some water.` / `✂️ This branch is growing larger than your core idea.`
- 나쁜 예: `"정말 좋은 아이디어네요! 🚀"` 의 반복 (cheerleader 금지)
- 긍정·부정 균형: 진실된 피드백 (Rule 8)

## 7.3 AI Context Architecture

매 호출 시 전체 대화를 그대로 보내지 않는다. **Context Builder**가 조립한다.

```text
Seed State + Current Idea + Important Decisions
+ Open Questions + Relevant Conversation + Current Branch
+ Growth History (+ 필요 시 Sunlight Research)
```

- 토큰 효율: 최근 대화 유지, 오래된 대화는 요약으로 압축
- 구조화: 각 명령(bloom, branch 등)마다 전용 시스템 프롬프트 + 상태 스키마

## 7.4 AI 출력 형식

- 모든 AI 응답은 목적별로 **구조화**되어야 함 (JSON 출력 + 자연어 설명 혼합 가능)
- 예: grow 응답 = `{ summary, question, maturityDelta, suggestions[] }`
- 파서(parser)는 AI 응답에서 구조를 안정적으로 추출해야 함 (재시도 로직 포함)

## 7.5 프롬프트 유형 (AI Prompt Types)

| 프롬프트 | 용도 |
|----------|------|
| plant | 아이디어 초기 구조화 |
| grow.question | 다음 질문 결정 |
| grow.input.classify | 애매한 입력을 답변·도움 요청·pause로 구분 |
| grow.update | 답변 반영 요약 갱신 |
| branch.suggest | 가지 제안 |
| prune.suggest | 가지치기 제안 |
| sunlight.analyze | 현실 검증 |
| bloom.evaluate | 성숙도 평가 |
| harvest.prd / trd / readme / prompt | 산출물 생성 |
| evolve.suggest | 진화 방향 제안 |
| wither / wake | 휴면/재성장 초기화 |

## 7.6 AI Provider 요구사항 (사용자 추가 요구 반영)

상세는 6.13 (F-11) 참조. 요약:
- 추상화 인터페이스: `LLMProvider` (chat(), stream(), testConnection(), listModels())
- OpenAI 계정연동 + API, Gemini API, Anthropic Claude API, Custom 추가 가능
- 프로바이더별 모델명, 온도, maxTokens 설정 가능
- 오류/재시도: rate limit, timeout, invalid key 처리 공통화
- 비용 표시: 각 명령 후 대략적 토큰 사용량 (선택적 표시)

---

# 8. MVP Scope (MVP 범위)

## 8.1 Must Have (MVP 필수)
```text
명령어: seed, grow, branch, prune, bloom, tree, history, harvest, config
저장:   .seed/ (JSON 파일 기반)
AI:     단일 Provider 이상 (OpenAI API + OAuth, Gemini, Anthropic Claude, Custom 아키텍처)
Harvest: idea, prd, trd
다국어:  영어(기본) + 한국어 UI (OQ6)
배포:    @seed-cli/seed (OQ2), 무료 오픈소스 (OQ3)
```

## 8.2 Should Have (가능하면 포함)
- 인터랙티브 모드 (`/grow` 등 REPL)
- 스피너/색상/멀티라인 입력
- OpenAI 계정 연동 로그인 (Local Browser OAuth, OQ7)
- 환경변수 기반 키 관리

## 8.3 Phase 2 — 구현 완료 (MVP 이후 출시)
- water, sunlight, evolve, wither, wake, garden, restore
- harvest readme, harvest prompt
- 멀티 프로바이더 벤치마크 (`config bench`, 지연시간 표시)

## 8.4 Phase 3 — 미구현
- merge (branch 결합, §6.18 참조)
- 토큰/비용 추적 UI
- Web UI, 시각 트리, 클라우드 동기화, 협업, AI Personas
- 추가 언어 팩 (커뮤니티 기여)

---

# 9. Differentiation (차별화)

## 9.1 기존 대안 (Alternatives)

| 대안 | 한계 (Seed 관점) |
|------|------------------|
| 일반 AI 채팅 (ChatGPT 등) | 지속성 없음, 아이디어 버전/이력 없음, 결정 기록 없음 |
| AI Coding Agent (Cursor, Claude Code) | "만들기"에 집중, 설계 전 사고 과정 미지원 |
| PRD 생성기/템플릿 도구 | 대화가 없음, 사용자 생각을 키우지 않음 |
| 노트/문서 도구 (Notion, Obsidian) | AI가 질문 주도로 성장시키지 않음 |
| 마인드맵 도구 | 구조화는 되지만 "성장·판정·수확" 흐름 없음 |

## 9.2 Why This Product (왜 Seed인가)

| Seed의 차별점 | 설명 |
|---------------|------|
| 1. 대화가 중심 | 문서 먼저가 아니라 대화로 생각을 발전 |
| 2. 성장 메타포 | 식물 성장 개념으로 전 UX가 일관 |
| 3. 아이디어 이력 | "어떻게 변했는지"까지 보존 (비파괴) |
| 4. Branch/Prune | 방향 실험 후 되돌릴 수 있음 |
| 5. Harvest | 필요한 순간에만 산출물 생성 |
| 6. Non-destructive | 사용자 코드/파일을 손대지 않음 |
| 7. 멀티 AI Provider | 벤더 록인 없음, Custom 추가 가능 |

## 9.3 Unique Value

> **채팅의 유연함 × 문서의 견고함 × 버전 관리의 지속성** 을 하나의 CLI에서.

---

# 10. UX Principles (UX 원칙)

| # | 원칙 | 설명 |
|---|------|------|
| R1 | 완벽한 아이디어 요구 금지 | 모호해도 시작 가능 |
| R2 | 질문 1개에 정보 과다 금지 | 작은 질문 단위 |
| R3 | 항상 요약 반영 | 사용자 생각을 되돌려줌 |
| R4 | 모순 발견 시 알림 | 부드럽게, 지적이 아닌 발견 |
| R5 | 비대 시 prune 제안 | 강제가 아닌 제안 |
| R6 | 조기 bloom 금지 | 성숙 전 개화 방지 |
| R7 | 명시적 결정 vs AI 추론 구분 | 결정 기록에 confirmedByUser |
| R8 | 무조건 긍정 금지 | 진실한 피드백 |
| R9 | 기본 코드/파일 변경 금지 | harvest 결과만 파일 생성 |
| R10 | PRD/TRD는 결과물 | 목적이 아님 |
| R11 | 마법사/설정 UX | 첫 실행부터 AI 연결까지 매끄럽게 |

---

# 11. Success Criteria (성공 지표)

## 11.1 제품 지표 (Metrics)

| 지표 | 목표 (1차 릴리스 후 3개월) | 측정 |
|------|------------------------------|------|
| M1 — seed → grow 완료율 | 첫 실행 사용자의 50% 이상 | 원격 측정(opt-in) 또는 로컬 이벤트 |
| M2 — bloom 도달율 | planted seed 중 20% 이상 | 로컬 이벤트 |
| M3 — harvest 생성율 | bloom 도달 seed 중 50% | 로컬 이벤트 |
| M4 — 재사용(2회 이상 명령) | 설치자의 30% | 원격/로컬 |
| M5 — 평균 성숙도 상승 | grow 1회당 평균 +3%p | 로컬 |
| M6 — 비대 감지 대응율 | prune 제안의 40% 수용 | 로컬 |

**주**: 로컬 CLI 특성상 **수동 원격 측정(opt-in 텔레메트리)** 또는 **로컬 이벤트 파일** 선택. 텔레메트리는 초기엔 기본 비활성화 권장 (개인정보 원칙).

## 11.2 품질 기준 (Quality Gates)

- 모든 명령어가 오류 없이 종료되며(exit code), 상태 파일이 무결하다
- AI 응답 파서 실패 시 graceful 재시도 (최대 2회) 후 명확한 오류
- 인터랙티브 모드에서 대화 손실 없음 (Ctrl+C 시 상태 보존)
- `.seed/` 구조가 문서(TRD 5장) 스키마와 항상 일치

## 11.3 북극성 지표 (North Star)

> **"사용자가 막연한 생각을 명확한, 검증된, 실행 가능한 프로젝트 정의로 바꾸는 데 성공한 횟수"**
> 대리 지표: bloom 80%+ 도달 후 harvest 산출물 생성 건수

---

# 12. Risks (리스크)

| # | 리스크 | 확률 | 영향 | 완화 |
|---|--------|------|------|------|
| R1 | AI 질문 품질 불안정 (쓸데없는 질문 반복) | 높음 | 높음 | 강력한 시스템 프롬프트 + Bloom 피드백 루프, 프롬프트 버전 관리 |
| R2 | 토큰 비용 증가 (긴 대화) | 중간 | 중간 | Context Builder로 선택적 포함, 대화 압축 |
| R3 | API 키 보안 사고 | 낮음 | 높음 | API 키는 환경변수에만 사용하고, OAuth 파일은 프로젝트 밖에 저장하며 gitignore·문서화로 보호 |
| R4 | 벤더 API 변경/중단 (OpenAI, Claude 등) | 중간 | 중간 | Provider abstraction, custom 추가 가능 |
| R5 | 사용자 이탈 (CLI 진입장벽) | 중간 | 높음 | 원샷 npm 패키지, 마법사, 멋진 TUI |
| R6 | "또 하나의 AI 래퍼"로 인식 | 중간 | 높음 | 성장 메타포 + 비파괴 + 이력 중심 UX로 차별화 |
| R7 | 로컬 저장 구조 비대/마이그레이션 | 중간 | 중간 | 명시적 스키마 + 버전 필드, 마이그레이션 스크립트 |
| R8 | 커스텀 프로바이더 호환성 (OpenAI 형식 불일치) | 중간 | 중간 | 표준 OpenAI 호환 엔드포인트 우선, 설정에서 헤더/형식 옵션 |
| R9 | AI가 사용자 몰래 "결정"하는 편향 | 중간 | 높음 | confirmedByUser 필드, 결정 제안 vs 확정 UI 분리 |

---

# 13. Future Opportunities (향후 기회)

| 기회 | 설명 | 단계 |
|------|------|------|
| Web UI (Seed Dashboard) | 시각적 트리, 여러 seed 대시보드 | Phase 3 |
| Visual Tree | 식물처럼 가지 시각화 | Phase 3 |
| Cloud Sync | 계정 기반 동기화 (OpenAI 계정연동 기반 확장) | Phase 3 |
| Collaboration | 다중 사용자 seed 성장 | Phase 3 |
| AI Personas | Gardener/Critic/Developer/Investor/User 관점 평가 | Phase 3 |
| IDE 확장 | VS Code 확장으로 seed 관리 | Phase 3 |
| 팀 리포트 | 스프린트/로드맵 입력 지원 | 후속 |
| 템플릿 마켓플레이스 | 분야별 질문 템플릿 공유 | 후속 |

---

# 14. Open Questions (오픈 질문 — 제품 결정 필요)

| # | 질문 | 중요도 | 결정 | 비고 |
|---|------|--------|------|------|
| OQ1 | 원격 텔레메트리 기본값 (off/on)? | 중간 | **기본 off** | 사용자가 명시적으로 `seed config set telemetry basic`으로 옵인 |
| OQ2 | npm 패키지명 `seed` 점유 여부 | 높음 | **`@seed-cli/seed`** | 현재 `npmjs.com`에 `seed` 패키지 존재, 충돌로 공식 설치 불가 → `npx @seed-cli/seed` 사용, CLI 바이너리 명은 여전히 `seed` |
| OQ3 | 무료 사용자 모델: CLI 도구라 유료화 모델은? | 중간 | **무료 오픈소스 + 후원 + 라이선스** | CLI 도구 자체는 무료. 오픈소스 라이선스(MIT 또는 Apache 2.0). 후원(sponsor) + 기업 라이선스 옵션 |
| OQ4 | CLI 커뮤니티 배포 경로(vs IDE) | 중간 | **npm 우선** | `npx @seed-cli/seed` 기본. 추후 IDE 확장은 Phase 3 |
| OQ5 | 로컬 모델(Ollama) 공식 지원 여부 | 낮음 | **❌ 외부 로컬 모델은 미지원** | 외부 연결 없이 동작하는 내장 deterministic fallback은 항상 제공하며, Ollama는 Custom Provider로 실험 가능 |
| OQ6 | 다국어 UX (비영어 스타일 문구는 아이디어 내용에만?) | 낮음 | **영어(UX 기본) + 한국어 지원** | `--lang ko` 또는 `SEED_LANG=ko` 환경변수. 기본은 영어. 입력 언어는 무관 |
| OQ7 | OpenAI 계정연동의 서버 인프라(토큰 발급) — 자체 백엔드 필요? | 높음 | **별도 백엔드 불필요 (로컬 Loopback OAuth 사용)** | `openai-oauth` 패키지가 브라우저 로그인과 localhost callback을 처리 |

## 14.1 OQ7 상세 — OpenAI 계정연동 (Local Browser OAuth)

Seed는 `openai-oauth`의 로컬 브라우저 OAuth 흐름을 사용한다. CLI가 공개 authorize URL을 브라우저로 열고, loopback callback을 받아 토큰을 로컬 Seed 경로에 저장한다. 사용자가 Client ID를 직접 발급하거나 Seed 백엔드를 운영할 필요가 없다.

> 참고: OpenAI 공식 API Docs — https://developers.openai.com/api/reference/overview
> 참고: OpenAI GitHub — https://github.com/openai/openai-python

### 공식 인증 방식

| 방식 | 설명 | 환경변수 |
|------|------|----------|
| **API Key** | Bearer 토큰, 가장 일반적 | `OPENAI_API_KEY` |
| **OAuth (Local Browser)** | ChatGPT 계정으로 로그인, 자체 백엔드 불필요 | `~/.seed/oauth/openai.json`에 토큰 저장 |

### Local Browser OAuth Flow

```text
[1] CLI → `openai-oauth`가 authorize URL과 PKCE/state를 준비
        → 브라우저를 열고 localhost callback(기본 1455 포트)을 대기

[2] 사용자가 브라우저에서 ChatGPT 계정으로 로그인

[3] callback 성공 시 access_token + refresh_token 반환
        → ~/.seed/oauth/openai.json에 저장

[4] 이후 호출은 로컬 자격 증명을 사용하고 필요하면 자동 갱신
```

### 자체 백엔드 불필요 이유

- Loopback OAuth는 **클라이언트 사이드**에서만 동작 (Seed 서버 불필요)
- 공개 Client ID와 callback은 `openai-oauth` 패키지가 관리
- 토큰 갱신은 CLI 로컬에서 수행
- 인증 페이지는 OpenAI 인증 서버에서 직접 제공

---

> ✅ **모든 OQ 결정 완료 (2026-08-29)**

---

# 15. Release Plan (릴리스 계획)

## Phase 1 (MVP) — v1.0
- 명령어: seed, grow, branch, prune, bloom, tree, history, harvest(idea/prd/trd), config
- 멀티 프로바이더 아키텍처 (OpenAI API + OAuth, Gemini API, Anthropic Claude API, Custom)
- 인터랙티브 모드, JSON 저장, 기본 TUI
- **다국어 UX: 영어 + 한국어** (기본 영어, `--lang ko`)
- npm 패키지: `@seed-cli/seed` (OQ2 결정)
- 무료 오프소스 + 후원 + 기업 라이선스 (OQ3 결정)

## Phase 2 — v1.1~1.5
- water, sunlight(+web), evolve, wither, wake, garden ✅ 구현 완료
- harvest readme/prompt, restore, 브랜치 복구 ✅ 구현 완료
- 멀티 프로바이더 벤치마크(`config bench`) ✅ 구현 완료 — 토큰/비용 표시는 미구현
- 하베스트 버전 관리 개선, 마크다운 export 개선
- (OQ6 확장) 추가 언어 팩 구조 (커뮤니티 기여 가능)

## Phase 3 — v2.0+
- merge (branch 결합) — 미구현
- Web Dashboard, Visual Tree, Cloud Sync, Collaboration, AI Personas
- IDE 확장, 팀 기능
- Cloud Sync 시 OpenAI OAuth 계정연동 기반 확장

---

# 16. 부록 — 요구사항 추적성 (Traceability)

| 사용자 니즈 (Seed.md) | PRD 기능 | TRD 모듈 |
|------------------------|----------|----------|
| 아이디어 심기 | F-01 seed | seed-manager, plant prompt |
| 질문 성장 | F-02 grow | `src/core/growth.ts`, `src/ai/context-builder.ts` |
| 관점 공급 | F-03 water | `src/cli/index.ts`, `src/ai/provider.ts` |
| 가지 뻗기 | F-04 branch | `src/core/branch.ts` |
| 가지치기 | F-05 prune | `src/core/branch.ts` |
| 현실 검증 | F-06 sunlight | `src/core/sunlight.ts`, `src/ai/provider.ts` |
| 구조 보기 | F-07 tree | `src/cli/index.ts`, `src/core/branch.ts` |
| 진화 | F-08 evolve | `src/cli/index.ts`, `src/core/seed-manager.ts` |
| 성숙도 검사 | F-09 bloom | `src/core/maturity.ts`, `src/ai/provider.ts` |
| 수확 | F-10 harvest | `src/core/harvest.ts` |
| AI 설정 (★) | F-11 config | `src/ai/provider.ts`, `src/ai/openai-oauth.ts`, `src/storage/store.ts` |
| 정원/기록/휴면/재성장 | F-12~F-14 | `src/core/garden.ts`, `src/core/lifecycle.ts`, `src/cli/index.ts` |
| 복구/결합 | F-15~F-16 | `src/core/lifecycle.ts` (merge는 Phase 3) |
| 다국어 UX (★) | F-17 i18n | `src/i18n/index.ts`, `src/i18n/en.json`, `src/i18n/ko.json` |

---

> **문서 작성 완료.**
> 다음 단계: TRD 참조 → 구현 우선순위 (Seed.md #65) 기준으로 개발 시작.
> 미해결 항목은 14장 Open Questions를 승인 후 진행.
