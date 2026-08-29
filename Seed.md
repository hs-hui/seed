# 🌱 SEED — AI-Powered Idea Growth CLI
## 제품 전체 기획 및 설계 명세서

---

# 0. 프로젝트 한 줄 정의

**Seed는 개발 아이디어를 씨앗처럼 심고, AI와의 대화를 통해 키우고, 가지를 뻗고, 가지치기하고, 현실에 비춰보고, 충분히 성숙한 뒤 원하는 결과물을 수확할 수 있게 해주는 개발자용 AI CLI 도구다.**

핵심은 **AI가 프로젝트를 대신 만들어주는 것**이 아니다.

Seed의 역할은 다음과 같다.

> **아이디어를 대신 결정하는 것이 아니라, 사용자가 무엇을 만들고 싶은지 발견하고 구체화하도록 돕는다.**

---

# 1. 제품 철학

## 핵심 문장

> **Plant an idea. Grow it. Build it.**

또는 제품의 핵심 철학:

> **Understand what is worth building before you build it.**

또는:

> **Seed doesn't build your project. Seed helps you discover what is worth building.**

---

# 2. 문제 정의

개발자는 종종 다음과 같은 상태에서 프로젝트를 시작한다.

- "뭔가 만들어보고 싶다."
- "AI를 활용한 프로그램을 만들고 싶다."
- "개발자한테 유용한 걸 만들고 싶다."
- "앱 아이디어는 있는데 뭔가 부족하다."
- "이 아이디어가 괜찮은지 모르겠다."
- "기능을 생각하다 보니 너무 커졌다."
- "정작 내가 뭘 만들고 싶은지 모르겠다."

현재 일반적인 AI 도구는 이런 상황에서 사용자의 말을 받아 바로 아이디어나 기능 목록을 만들어주는 경우가 많다.

Seed는 이와 다르게 **질문과 대화 자체를 핵심 UX로 삼는다.**

사용자의 생각을 먼저 듣고, 필요한 질문을 하고, 모호한 부분을 찾아내고, 다양한 방향을 제시하고, 현실성을 점검하고, 필요할 때만 결과물을 만든다.

---

# 3. 타깃 사용자

## 3.1 Primary Target

### 개인 개발자

특히 다음과 같은 개발자:

- 사이드 프로젝트를 자주 시작하는 사람
- "뭔가 만들어보고 싶다"는 생각은 많지만 아이디어를 구체화하기 어려운 사람
- AI를 활용한 개발을 하고 싶은 사람
- 새로운 프로젝트를 시작하기 전에 방향을 잡고 싶은 사람
- CLI / npm / Node.js 생태계를 사용하는 개발자

---

## 3.2 Secondary Target

### 주니어 개발자

아이디어를 어떻게 구체화해야 할지 잘 모르는 사람.

### 학생 / 개발 입문자

프로젝트 주제를 정하거나 포트폴리오 프로젝트를 정할 때 사용.

### 사이드 프로젝트 개발자

취미로 여러 프로젝트를 실험하며 아이디어를 발전시키는 사람.

### 개발팀 / 스타트업 초기 구성원

아이디어를 팀과 논의하기 전에 초기 방향을 정리하는 용도.

---

# 4. Seed가 해결하는 핵심 문제

Seed의 핵심 문제는 코딩이 아니다.

### 문제 1 — 아이디어가 너무 모호함

> "개발자용 뭔가를 만들고 싶다."

### 문제 2 — 아이디어는 있지만 핵심이 없음

> "공부 앱을 만들고 싶은데 기능이 너무 많다."

### 문제 3 — 여러 방향이 있음

> "웹앱으로 할까? CLI로 할까? VS Code Extension으로 할까?"

### 문제 4 — 현실성이 불확실함

> "이걸 정말 사람들이 쓸까?"

### 문제 5 — 아이디어가 너무 커짐

처음에는 작은 아이디어였는데 계속 기능이 붙어서 프로젝트가 감당할 수 없을 정도로 커진다.

### 문제 6 — 프로젝트를 시작했지만 방향이 바뀜

처음 아이디어와 실제 만들고 싶은 것이 달라진다.

---

# 5. Seed가 하지 않는 것

Seed의 기본 철학상 다음 작업은 핵심 기능이 아니다.

## 코드 수정

Seed가 사용자의 프로젝트 파일을 수정하지 않는다.

## 코드 작성

Seed가 프로젝트 코드를 자동으로 작성하지 않는다.

## 자동 구현

Seed가 사용자의 프로젝트를 직접 만들어주지 않는다.

## 독단적 의사결정

AI가 사용자 대신 "이걸 만들어야 한다"고 결정하지 않는다.

---

# 6. 단, 선택적인 결과물 생성은 가능

Seed는 마지막 단계에서 사용자가 원할 경우 결과물을 생성할 수 있다.

예:

- Idea Card
- Project Brief
- PRD
- TRD
- README
- Development Brief
- Coding Prompt
- 기타 문서

중요한 점:

**이것들은 Seed의 목적이 아니라 "Harvest" 단계의 결과물이다.**

즉:

> PRD를 만들기 위해 Seed를 사용하는 것이 아니다.

반대로:

> 아이디어를 충분히 성장시킨 결과, 필요하면 PRD를 수확할 수 있다.

---

# 7. 핵심 개념 — 식물 성장 은유

Seed의 모든 UX와 CLI 명령어는 **식물 성장**이라는 하나의 은유로 통일한다.

전체 흐름:

```text
🌱 Seed
 ↓
💧 Grow / Water
 ↓
🌿 Branch
 ↓
✂️ Prune
 ↓
☀️ Sunlight
 ↓
🌳 Tree
 ↓
🧬 Evolve
 ↓
🌸 Bloom
 ↓
🍎 Harvest
```

아이디어가 필요하면:

```text
🍂 Wither
 ↓
☀️ Wake
```

여러 아이디어는:

```text
🌱 Garden
```

성장 과정은:

```text
📜 History
```

---

# 8. Seed의 핵심 사용자 경험

가장 기본적인 사용자 흐름:

```bash
npx seed
```

사용자:

```text
🌱 SEED

Plant something worth building.

What is on your mind?

>
```

예:

```text
> 개발자들이 프로젝트를 이해하기 쉽게
  해주는 뭔가를 만들고 싶어
```

AI:

```text
🌱 A new seed has been planted.

Let's grow it.

What makes existing projects difficult
to understand?
```

사용자가 답변.

AI가 다음 질문을 결정.

반복:

```text
질문
 ↓
답변
 ↓
현재 아이디어 갱신
 ↓
새로운 질문
 ↓
다시 성장
```

---

# 9. Seed의 가장 중요한 AI 원칙

AI는 **Gardener(정원사)** 역할을 한다.

AI가 해야 하는 역할:

- 질문하기
- 듣기
- 사용자의 생각 요약하기
- 모순 발견하기
- 빈 부분 찾기
- 새로운 관점 제공하기
- 여러 방향 제시하기
- 너무 커진 아이디어 알려주기
- 필요 없는 부분 제거 제안하기
- 현실적인 위험 알려주기
- 아이디어의 성숙도를 판단하기
- 최종 결과물을 정리하기

AI가 하지 말아야 할 역할:

- 무조건 칭찬하기
- 사용자 대신 결정하기
- 무조건 기능을 늘리기
- 무조건 최신 기술을 붙이기
- 코드 수정하기
- 프로젝트 파일 수정하기

---

# 10. AI 대화 스타일

Seed AI는 일반적인 "AI 비서" 느낌보다 **정원사가 아이디어를 돌보는 느낌**을 가져야 한다.

좋은 예:

> 🌱 A new seed has been planted.

> 💧 Let's give this idea some water.

> 🌿 I see two different directions growing here.

> ✂️ This branch is getting larger than your core idea.

> ☀️ Let's see how this idea looks in the real world.

> 🌸 Your idea is starting to bloom.

> 🍎 Your idea is ready to harvest.

피해야 할 예:

> "정말 좋은 아이디어네요! 🚀"

를 모든 상황에서 반복하는 것.

Seed AI는 **cheerleader보다 gardener에 가깝다.**

---

# 11. 명령어 전체 구조

```text
seed
│
├── grow
├── water
├── sunlight
├── branch
├── prune
├── tree
├── evolve
├── bloom
│
├── harvest
│   ├── idea
│   ├── brief
│   ├── prd
│   ├── trd
│   ├── readme
│   ├── prompt
│   └── all
│
├── wither
├── wake
├── garden
└── history
```

---

# 12. `seed`

## 역할

새로운 아이디어를 심는다.

```bash
npx seed
```

또는:

```bash
npx seed "개발자를 위한 음악 앱을 만들고 싶어"
```

### 동작

아이디어가 주어지면 해당 아이디어를 새로운 Seed로 생성한다.

초기 상태:

```text
🌱 Seedling
```

초기 maturity:

```text
0~10%
```

초기 Seed에는 최소한 다음을 저장할 수 있다.

- 원래 사용자 입력
- 생성 시간
- 현재 아이디어 요약
- 상태
- 성장도
- 질문 기록
- 답변 기록

---

# 13. `grow`

## 역할

아이디어를 성장시킨다.

```bash
npx seed grow
```

AI는 현재 Seed 상태를 읽고 가장 필요한 질문을 하나 또는 몇 개 제시한다.

예:

```text
🌱 Your seed is growing...

Current idea:

"개발자용 음악 앱"

Growth: 23%

💧 What makes this different from Spotify?
```

사용자 답변 후:

```text
🌱 Growth update

Before:
"개발자를 위한 음악 앱"

Now:
"A music experience designed
around focused coding sessions."
```

### Grow의 특징

고정된 설문조사가 아니다.

AI가 다음 정보를 기반으로 질문을 결정한다.

- 기존 답변
- 비어 있는 정보
- 불확실한 정보
- 모순
- 사용자가 흥미를 보인 부분
- 과도하게 확장된 부분

---

# 14. `water`

## 역할

아이디어에 새로운 관점을 공급한다.

```bash
npx seed water
```

Grow보다 더 자유로운 브레인스토밍 기능.

예:

```text
💧 Let's water your idea.

Look at it from another perspective:

👤 User
What would make someone use this every day?

💰 Business
Could anyone pay for this?

⚙️ Technical
What makes this technically interesting?

🎨 Experience
What should the first 30 seconds feel like?
```

Water는 아이디어의 부족한 부분을 직접 질문하는 대신 **관점을 추가해주는 역할**을 한다.

---

# 15. `sunlight`

## 역할

아이디어를 외부 현실에 비춰본다.

```bash
npx seed sunlight
```

질문 예:

```text
☀️ SUNLIGHT

Let's step outside your idea.

Who would actually use this?

What do they use today?

Why would they switch?

What existing alternatives exist?
```

가능한 분석 영역:

- 사용자
- 경쟁 제품
- 기존 해결 방법
- 차별점
- 시장 상황
- 비용
- 현실적인 제약
- 기술적 현실성

필요하면 웹 검색과 결합 가능.

단, 결과는 사실과 추정을 구분해서 표시해야 한다.

---

# 16. `branch`

## 역할

하나의 아이디어에서 여러 방향을 뻗는다.

```bash
npx seed branch
```

예:

```text
🌿 Your seed can grow in several directions.

A. Repository Explorer
B. AI Code Teacher
C. Project Onboarding
D. Architecture Visualizer
```

각 Branch는 독립적인 상태를 가진다.

예:

```text
🌱 Original
│
├── 🌿 A
├── 🌿 B
├── 🌿 C
└── 🌿 D
```

사용자는 특정 Branch를 선택해서 다시 `grow`할 수 있다.

예:

```bash
npx seed branch 4
```

---

# 17. `prune`

## 역할

아이디어의 불필요한 가지를 제거한다.

```bash
npx seed prune
```

예:

```text
✂️ PRUNING

Your idea has grown quite large.

Possible branches to remove:

✂ Social features
✂ Mobile application
✂ Team collaboration

Your strongest core appears to be:

"Helping developers understand
unfamiliar repositories."
```

사용자가 제거할 가지를 선택한다.

Prune은 **MVP 범위 관리** 역할도 한다.

---

# 18. `tree`

## 역할

아이디어 전체 구조와 현재 성장 상태를 보여준다.

```bash
npx seed tree
```

예:

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

Tree는 Seed의 대표적인 시각적 기능으로 발전시킬 수 있다.

---

# 19. `evolve`

## 역할

이미 성장한 아이디어를 새로운 세대로 발전시킨다.

```bash
npx seed evolve
```

예:

```text
🌸 Current Bloom

"CLI repository explorer"

🧬 Possible evolutions:

1. VS Code integration
2. Team onboarding
3. Open-source documentation
4. Interactive architecture map
```

사용자가 하나를 선택하면 기존 아이디어를 기반으로 새로운 방향이 만들어진다.

Branch와 차이:

### Branch

현재 아이디어 안에서 다른 가지를 만든다.

### Evolve

현재 아이디어 자체를 다음 단계의 새로운 아이디어로 발전시킨다.

---

# 20. `bloom`

## 역할

아이디어의 성숙도를 검사한다.

```bash
npx seed bloom
```

예:

```text
🌸 BLOOM CHECK

Problem             ██████████ 92%
User                █████████░ 86%
Core Value          ██████████ 94%
Differentiation     ██████░░░░ 61%
Scope               ████████░░ 79%
Feasibility         ████████░░ 81%

Overall maturity: 82%
```

### 평가 항목

- Problem clarity
- User clarity
- Core value
- Differentiation
- Scope
- Feasibility
- Motivation
- Confidence

아이디어가 충분히 성숙하지 않았다면 다시 Grow를 제안한다.

예:

```text
🌱 Your idea is not ready to bloom yet.

The core problem is clear,
but your target user is still vague.

Let's grow that part.
```

---

# 21. `harvest`

## 역할

성장한 아이디어에서 실제 결과물을 수확한다.

```bash
npx seed harvest
```

선택:

```text
🍎 HARVEST

What would you like to harvest?

1. 🍎 Idea Card
2. 📋 PRD
3. 🏗️ TRD
4. 🧑‍💻 Development Brief
5. 📖 README
6. 🤖 Coding Prompt
7. 🍎 Everything
```

핵심:

**PRD와 TRD는 Harvest의 산출물이다.**

Seed의 처음부터 PRD가 필요한 것은 아니다.

---

# 22. `harvest idea`

간단한 Idea Card를 생성한다.

예:

```markdown
# RepoLens

## One-line Idea

A tool that helps developers understand
unfamiliar GitHub repositories.

## Target User

Developers exploring unfamiliar codebases.

## Problem

Understanding an existing codebase takes
significant cognitive effort.

## Core Experience

Ask natural-language questions about a project
and receive context-aware explanations.

## Key Insight

The main problem is not writing code.
It is understanding existing code.
```

---

# 23. `harvest brief`

PRD보다 짧은 형태.

목표:

- 아이디어 한 줄
- 문제
- 사용자
- 핵심 경험
- 주요 기능
- 범위
- 차별점
- MVP

한 페이지 정도로 제공.

---

# 24. `harvest prd`

## 목적

성장한 Seed를 공식 Product Requirements Document로 변환한다.

PRD는 지금까지 축적된:

- 대화
- 결정
- Branch
- Prune
- Sunlight
- Bloom 결과

를 바탕으로 생성한다.

### PRD 구조

```markdown
# Product Requirements Document

## 1. Product Overview

### Product Name

### One-line Description

### Vision

### Background

---

## 2. Problem

### Problem Statement

### Current Situation

### User Pain Points

---

## 3. Target Users

### Primary User

### Secondary Users

### User Context

---

## 4. Goals

### Primary Goals

### Secondary Goals

### Non-goals

---

## 5. Core User Experience

### Main User Journey

### User Flow

---

## 6. Product Features

### Feature 1

### Feature 2

### Feature 3

---

## 7. MVP Scope

### Must Have

### Should Have

### Future

---

## 8. Differentiation

### Alternatives

### Why this product

### Unique Value

---

## 9. UX Principles

---

## 10. Success Criteria

---

## 11. Risks

---

## 12. Future Opportunities

---

## 13. Open Questions
```

PRD에는 AI가 임의로 사실을 만들어서는 안 된다.

정보가 부족한 항목은:

```text
TBD
```

또는:

```text
Open Question
```

으로 표시한다.

---

# 25. `harvest trd`

## 목적

PRD가 정의한 제품을 기술적인 구조로 변환한다.

TRD는 Seed의 아이디어와 사용자의 기술적 선택을 바탕으로 한다.

단, Seed가 코드 구현을 직접 수행하지는 않는다.

### TRD 구조

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

# 26. PRD와 TRD 생성 원칙

PRD:

> **무엇을 만들고 왜 만드는가**

TRD:

> **그것을 어떤 기술 구조로 만들 것인가**

Seed:

> **그 전에 무엇을 만들어야 하는지 명확하게 발견한다.**

즉:

```text
🌱 Seed
 ↓
아이디어
 ↓
Grow
 ↓
Branch
 ↓
Prune
 ↓
Sunlight
 ↓
Bloom
 ↓
🍎 Harvest
 ├── Idea Card
 ├── Brief
 ├── PRD
 ├── TRD
 ├── README
 └── Coding Prompt
```

---

# 27. `harvest readme`

프로젝트 소개용 README를 생성한다.

예상 내용:

- Project Name
- Description
- Why
- Features
- Usage
- Installation
- Examples
- Architecture overview
- Development
- License placeholder

---

# 28. `harvest prompt`

AI Coding Agent에게 넘길 수 있는 작업 프롬프트를 생성한다.

중요:

**Seed가 코드를 만드는 것이 아니다.**

사용자가 다른 개발 도구나 AI Coding Agent를 이용할 수 있도록 명확한 작업 지시서를 수확한다.

예:

```text
You are implementing RepoLens.

Context:
...

Goals:
...

Expected behavior:
...

Constraints:
...

Acceptance criteria:
...
```

---

# 29. `wither`

## 역할

아이디어를 삭제하지 않고 잠시 휴면시킨다.

```bash
npx seed wither
```

예:

```text
🍂 This seed has stopped growing.

Put it to sleep?

[y] Yes
[n] No
```

Seed는 삭제되지 않는다.

상태:

```text
dormant
```

---

# 30. `wake`

휴면 중인 Seed를 다시 깨운다.

```bash
npx seed wake
```

예:

```text
☀️ Your seed is waking up.

Last grown:
42 days ago.

What has changed since then?
```

과거 대화와 현재 상황을 비교하면서 다시 Grow 단계로 들어간다.

---

# 31. `garden`

여러 Seed를 관리한다.

```bash
npx seed garden
```

예:

```text
🌱 YOUR GARDEN

🌸 RepoLens
   Mature: 92%

🌳 DevMusic
   Growing: 61%

🌱 GameTracker
   Seedling: 14%

🍂 Social CLI
   Dormant
```

각 Seed는 하나의 독립 프로젝트 아이디어다.

---

# 32. `history`

아이디어가 어떻게 성장했는지 보여준다.

```bash
npx seed history
```

예:

```text
📜 GROWTH HISTORY

Day 1
🌱 "개발자에게 유용한 도구"

Day 1
💧 "프로젝트 이해가 어렵다"

Day 1
🌿 Branch: Repository Explorer

Day 2
✂️ Removed: Social Features

Day 2
☀️ Competitor analysis

Day 3
🌸 Bloom

Day 3
🍎 Harvested PRD
```

History는 아이디어의 "Git History" 같은 개념이다.

---

# 33. Seed 파일 시스템

프로젝트 내부에는 `.seed/` 디렉터리를 사용할 수 있다.

예:

```text
.seed/
│
├── seed.json
│
├── conversations/
│   ├── 001.json
│   ├── 002.json
│   └── 003.json
│
├── growth/
│   ├── 001.json
│   ├── 002.json
│   └── 003.json
│
├── branches/
│   ├── original/
│   ├── repository-explorer/
│   └── code-teacher/
│
├── decisions/
│
├── research/
│
└── harvest/
    ├── idea.md
    ├── brief.md
    ├── prd.md
    ├── trd.md
    ├── readme.md
    └── prompt.md
```

---

# 34. Seed State

`seed.json` 예시:

```json
{
  "name": "RepoLens",
  "status": "bloomed",
  "maturity": 82,
  "originalIdea": "개발자들이 프로젝트를 이해하기 쉽게 해주는 도구",
  "coreIdea": "A tool that helps developers understand unfamiliar repositories",
  "problem": "Developers struggle to understand unfamiliar codebases",
  "users": [
    "developers exploring unfamiliar repositories"
  ],
  "goals": [],
  "constraints": [],
  "branches": [],
  "decisions": [],
  "openQuestions": [],
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

# 35. 대화 데이터

대화도 저장한다.

예:

```json
{
  "id": "conversation-001",
  "role": "assistant",
  "type": "question",
  "content": "What makes existing projects difficult to understand?",
  "timestamp": "..."
}
```

사용자의 답변:

```json
{
  "id": "conversation-002",
  "role": "user",
  "type": "answer",
  "content": "I don't know where to start reading the code.",
  "timestamp": "..."
}
```

---

# 36. Decision 저장

AI가 사용자 대신 결정하지 않도록 **Decision**이라는 개념을 둔다.

예:

```json
{
  "decision": "CLI instead of web application",
  "reason": "User wants local developer workflow",
  "source": "conversation-009",
  "confirmedByUser": true
}
```

중요:

AI가 추론한 내용과 사용자가 실제로 결정한 내용을 구분해야 한다.

---

# 37. Open Questions

아직 답하지 않은 질문도 저장한다.

예:

```json
{
  "question": "Who is the primary user?",
  "importance": "high",
  "status": "open"
}
```

Bloom 단계에서 중요한 Open Question이 남아 있으면 성숙도가 내려간다.

---

# 38. AI Context Architecture

AI에게 모든 대화를 매번 그대로 전달하는 구조는 지양한다.

대신 다음과 같은 Context를 구성한다.

```text
Seed State
+
Current Idea
+
Important Decisions
+
Open Questions
+
Relevant Conversation
+
Current Branch
+
Growth History
```

그리고 필요할 때:

```text
Sunlight Research
```

를 추가한다.

즉:

```text
User Input
 ↓
Seed State
 ↓
Context Builder
 ↓
LLM
 ↓
Question / Insight / Decision Proposal
 ↓
State Update
```

---

# 39. AI Provider 구조

특정 AI 하나에 강하게 결합하지 않도록 Provider abstraction을 고려한다.

예:

```text
LLM Provider
├── OpenAI
├── Anthropic
└── Local Model
```

CLI 설정:

```bash
npx seed config
```

를 통해 Provider 및 API Key 등을 설정할 수 있게 한다.

---

# 40. npm / npx 배포

목표:

```bash
npx seed
```

가 바로 작동하는 npm package.

설치:

```bash
npm install -g seed
```

또는 권장 기본 사용:

```bash
npx seed
```

가능한 명령어:

```bash
npx seed
npx seed grow
npx seed water
npx seed branch
npx seed prune
npx seed sunlight
npx seed tree
npx seed evolve
npx seed bloom
npx seed harvest
npx seed garden
npx seed history
npx seed wither
npx seed wake
```

---

# 41. 기술적으로 권장되는 초기 Stack

Seed 자체:

```text
Node.js
TypeScript
```

CLI:

```text
Commander.js
```

또는 다른 안정적인 CLI framework.

Validation:

```text
Zod
```

Terminal UI:

- 색상/아이콘
- spinner
- interactive selection
- multiline input

Storage:

초기에는:

```text
.seed/*.json
```

기반의 로컬 저장을 권장.

추후:

- SQLite
- cloud sync
- web dashboard

등으로 확장 가능.

---

# 42. 프로젝트 구조 예시

```text
seed/
├── src/
│   ├── cli/
│   │   ├── index.ts
│   │   ├── commands/
│   │   │   ├── seed.ts
│   │   │   ├── grow.ts
│   │   │   ├── water.ts
│   │   │   ├── branch.ts
│   │   │   ├── prune.ts
│   │   │   ├── sunlight.ts
│   │   │   ├── tree.ts
│   │   │   ├── evolve.ts
│   │   │   ├── bloom.ts
│   │   │   ├── harvest.ts
│   │   │   ├── wither.ts
│   │   │   ├── wake.ts
│   │   │   ├── garden.ts
│   │   │   └── history.ts
│   │
│   ├── core/
│   │   ├── seed-manager.ts
│   │   ├── growth-engine.ts
│   │   ├── branch-engine.ts
│   │   ├── maturity-engine.ts
│   │   └── harvest-engine.ts
│   │
│   ├── ai/
│   │   ├── provider.ts
│   │   ├── context-builder.ts
│   │   ├── prompts/
│   │   └── parsers/
│   │
│   ├── storage/
│   │   ├── seed-store.ts
│   │   ├── conversation-store.ts
│   │   └── branch-store.ts
│   │
│   ├── harvest/
│   │   ├── idea.ts
│   │   ├── brief.ts
│   │   ├── prd.ts
│   │   ├── trd.ts
│   │   ├── readme.ts
│   │   └── prompt.ts
│   │
│   └── ui/
│       ├── renderer.ts
│       ├── prompts.ts
│       └── tree.ts
│
├── package.json
├── tsconfig.json
└── README.md
```

---

# 43. Seed Lifecycle

전체 상태:

```text
seedling
   ↓
growing
   ↓
branching
   ↓
pruning
   ↓
evaluating
   ↓
blooming
   ↓
mature
   ↓
harvested
```

휴면:

```text
any state
   ↓
dormant
   ↓
wake
```

---

# 44. Maturity Model

Seed의 성숙도를 0~100%로 표현할 수 있다.

예시:

```text
0-20   🌱 Seedling
21-40  🌿 Growing
41-60  🌳 Developing
61-80  🌸 Near Bloom
81-100 🌸 Mature
```

평가 기준:

```text
Problem clarity
User clarity
Core value
Scope clarity
Differentiation
Feasibility
Motivation
Confidence
```

단, **이 수치는 절대적인 과학적 점수가 아니라 UX용 지표**임을 명확히 한다.

---

# 45. Branch 모델

Branch는 원본을 직접 변경하는 방식보다 독립적인 아이디어 경로로 취급한다.

예:

```text
Seed A
│
├── Branch A1
├── Branch A2
└── Branch A3
```

각 Branch에는:

- summary
- assumptions
- decisions
- openQuestions
- maturity
- parentBranch
- createdAt

등을 저장한다.

---

# 46. Prune 모델

Prune한 가지는 바로 삭제하지 않는 것이 좋다.

상태:

```text
pruned
```

로 유지하여 history에서 확인할 수 있게 한다.

예:

```text
Active
Pruned
Dormant
Merged
```

향후 다시 Branch로 되살릴 수도 있다.

---

# 47. Branch Merge

향후 확장 기능으로 고려할 수 있다.

예:

```text
🌿 Branch A
+
🌿 Branch B
↓
🌳 Combined direction
```

두 아이디어의 장점을 결합하는 기능.

명령어 예:

```bash
npx seed merge
```

MVP에서는 필수 아님.

---

# 48. Sunlight의 Research 원칙

Sunlight에서 외부 정보를 사용하는 경우:

- 검색 결과를 사실로 단정하지 않는다.
- 출처를 저장할 수 있게 한다.
- 사용자 의견과 외부 사실을 분리한다.
- 오래된 정보와 최신 정보를 구분한다.
- 경쟁 제품 분석 시 실제 존재 여부를 확인한다.

데이터 구조 예:

```json
{
  "source": "...",
  "title": "...",
  "summary": "...",
  "retrievedAt": "...",
  "relevance": "high"
}
```

---

# 49. Bloom의 목적

Bloom은 단순한 "점수 매기기"가 아니다.

핵심 목적:

> **아이디어를 만들 수 있을 정도로 명확하게 되었는가?**

따라서 Bloom 결과에는 항상:

```text
What is clear
What is uncertain
What should be explored
```

가 포함되어야 한다.

예:

```text
🌸 BLOOM REVIEW

Clear:
✓ Problem
✓ Target user
✓ Core experience

Unclear:
⚠ Differentiation
⚠ MVP scope

Recommendation:
Grow differentiation once more.
```

---

# 50. Harvest의 원칙

Harvest 결과물은 **Seed의 현재 상태를 반영**해야 한다.

PRD를 생성했는데 이후 아이디어가 변경되면 기존 PRD는 자동으로 덮어쓰기보다는 새로운 버전으로 저장하는 것이 좋다.

예:

```text
harvest/
├── prd-v1.md
├── prd-v2.md
├── trd-v1.md
└── idea-v3.md
```

또는:

```text
harvest/
└── 2026-08-29/
    ├── prd.md
    └── trd.md
```

---

# 51. Versioning

아이디어도 버전이 있다.

예:

```text
Idea v1
"Developer music app"

Idea v2
"Music app for coding sessions"

Idea v3
"Adaptive music environment based on coding activity"
```

이것은 `history`에서 볼 수 있어야 한다.

---

# 52. Undo / Restore 개념

사용자가 잘못 Prune했을 때 복구 가능해야 한다.

예:

```bash
npx seed restore
```

또는:

```bash
npx seed tree --all
```

을 통해 과거 가지를 확인한다.

---

# 53. 첫 실행 UX

처음 사용하는 사람은 명령어를 몰라도 된다.

```bash
npx seed
```

실행 후:

```text
🌱 Welcome to Seed.

You don't need a perfect idea.

Just plant something.

What is on your mind?
```

이후 바로 대화 시작.

---

# 54. Interactive Mode

기본적으로 대화형 모드를 권장한다.

예:

```text
🌱 Seed > 
```

사용 가능한 명령:

```text
/grow
/water
/branch
/prune
/sunlight
/tree
/evolve
/bloom
/harvest
/history
/garden
/wither
/wake
/help
/exit
```

즉:

```bash
npx seed
```

하나로 들어와서 모든 과정을 진행할 수도 있다.

CLI 명령어를 직접 입력하는 방식과 Interactive Mode를 둘 다 지원한다.

---

# 55. 예시 전체 세션

```text
$ npx seed

🌱 SEED

Plant something worth building.

What is on your mind?

> 개발자들이 프로젝트를 이해하기 쉬운 도구를 만들고 싶어
```

```text
🌱 A new seed has been planted.

💧 Let's grow it.

What is difficult about understanding
a new project?
```

```text
> 어디부터 봐야 할지 모르겠어
```

```text
🌱 Growth update

Your idea is becoming clearer.

Problem:
Developers don't know where to start
when entering an unfamiliar repository.

What would the user ideally ask?
```

```text
> "로그인은 어디서 처리해?"
```

```text
🌿 I see a direction growing.

This could become:

A. Repository Explorer
B. AI Code Teacher
C. Project Onboarding
D. Architecture Map

Use /branch to explore these.
```

```text
> /branch
```

```text
🌿 Branches created.

1. Repository Explorer
2. AI Code Teacher
3. Project Onboarding
4. Architecture Map
```

```text
> 1
```

```text
🌿 Growing branch: Repository Explorer

Should the user:
A. Ask natural language questions?
B. Explore visually?
C. Both?
```

```text
> A
```

```text
☀️ Let's step outside the idea.

What would developers use today
instead of this?
```

사용자와 현실 검증.

이후:

```text
✂️ Some features are growing too quickly.

Suggested pruning:

✂ Visual editor
✂ Team collaboration
✂ Mobile app
```

이후:

```text
🌸 BLOOM CHECK

Problem             95%
User                91%
Core Value          94%
Differentiation     79%
Scope               88%
Feasibility         84%

Overall maturity: 89%

🌸 Your seed is ready.
```

마지막:

```text
🍎 HARVEST

1. Idea Card
2. PRD
3. TRD
4. README
5. Coding Prompt
6. All
```

---

# 56. Seed의 차별화

Seed는 일반적인:

- AI Chatbot
- AI Coding Agent
- Code Generator
- PRD Generator

와 다르다.

핵심 차별점은:

### 1. 대화가 중심

문서를 먼저 만드는 것이 아니라 대화로 생각을 발전시킨다.

### 2. 성장이라는 메타포

모든 과정이 일관된 개념으로 연결된다.

### 3. 아이디어의 역사

현재 결과뿐 아니라 아이디어가 어떻게 변했는지도 보존한다.

### 4. Branch / Prune

아이디어를 여러 방향으로 실험하고 다시 줄일 수 있다.

### 5. Harvest

필요한 순간에만 PRD/TRD 등을 만든다.

### 6. Non-destructive

기본적으로 사용자의 코드나 프로젝트를 수정하지 않는다.

---

# 57. MVP 범위

처음 버전에서 모든 기능을 구현할 필요는 없다.

## MVP 필수

```text
🌱 seed
💧 grow
🌿 branch
✂️ prune
🌸 bloom
🍎 harvest
🌳 tree
📜 history
```

저장:

```text
.seed/
```

AI:

```text
single LLM provider
```

Harvest:

```text
idea
prd
trd
```

이 정도면 충분하다.

---

# 58. Phase 2

추가:

```text
💧 water
☀️ sunlight
🧬 evolve
🍂 wither
☀️ wake
🌱 garden
```

그리고:

- 여러 AI Provider
- Research source 저장
- Branch restore
- Versioning
- Better terminal UI
- Markdown export

---

# 59. Phase 3

장기 확장:

### Web UI

```text
🌱 Seed Dashboard
```

### Visual Tree

실제 식물처럼 Branch를 시각화.

### Cloud Sync

Seed를 계정과 동기화.

### Collaboration

여러 사용자가 하나의 Seed를 같이 성장시킴.

### AI Personas

예:

```text
🌱 Gardener
☀️ Critic
🧑‍💻 Developer
💰 Investor
👤 User
```

각 관점에서 아이디어를 평가.

---

# 60. 장기 비전

최종적으로 Seed는 단순 CLI가 아니라:

> **아이디어가 탄생해서 실제 프로젝트가 되기까지의 전체 초기 사고 과정을 관리하는 "Idea Development Environment"**

가 될 수 있다.

개발자는:

```text
🌱 idea
 ↓
💧 think
 ↓
🌿 explore
 ↓
✂️ focus
 ↓
☀️ validate
 ↓
🌸 define
 ↓
🍎 harvest
 ↓
🧑‍💻 build
```

의 흐름을 경험한다.

그리고 개발 자체는 Seed가 하지 않아도 된다.

Seed의 역할은 **Build 이전 단계의 사고를 구조화하는 것**이다.

---

# 61. 핵심 제품 문장

제품 페이지나 README에는 다음과 같은 문구를 사용할 수 있다.

> **Seed your idea. Grow what matters.**

> **Plant an idea. Grow it into something worth building.**

> **From vague thought to clear direction.**

> **Don't build the wrong thing faster.**

> **Seed doesn't build your project. It helps you discover what is worth building.**

---

# 62. 가장 중요한 UX 원칙

### Rule 1

사용자에게 완벽한 아이디어를 요구하지 않는다.

### Rule 2

질문 하나가 너무 많은 정보를 요구하지 않도록 한다.

### Rule 3

AI가 사용자의 생각을 요약해서 되돌려준다.

### Rule 4

모순을 발견하면 알려준다.

### Rule 5

아이디어가 커지면 Prune을 제안한다.

### Rule 6

아이디어가 너무 일찍 Bloom하면 안 된다.

### Rule 7

사용자의 명시적 결정을 AI의 추론과 구분한다.

### Rule 8

AI는 무조건 긍정하지 않는다.

### Rule 9

기본적으로 코드/파일을 변경하지 않는다.

### Rule 10

PRD/TRD는 목적이 아니라 Harvest 결과물이다.

---

# 63. 최종 제품 모델

Seed는 다음 5개 계층으로 이해할 수 있다.

## Layer 1 — Plant

아이디어를 시작한다.

```text
seed
```

## Layer 2 — Grow

아이디어를 탐색하고 성장시킨다.

```text
grow
water
branch
```

## Layer 3 — Shape

아이디어를 현실적으로 다듬는다.

```text
prune
sunlight
tree
evolve
```

## Layer 4 — Bloom

아이디어가 충분히 명확한지 확인한다.

```text
bloom
```

## Layer 5 — Harvest

원하는 결과물을 만든다.

```text
harvest
```

보조:

```text
history
garden
wither
wake
```

---

# 64. 구현 시 가장 중요한 방향

이 프로젝트의 핵심은 CLI 명령어 숫자가 아니다.

진짜 핵심은:

> **AI가 지금까지의 대화를 기억하고, 현재 아이디어 상태를 이해하고, "다음에 무엇을 질문해야 아이디어가 가장 잘 성장하는지" 판단하는 것**

이다.

따라서 AI prompt architecture와 state management가 제품의 핵심 기술이 된다.

AI는 매번:

```text
"What should I output?"
```

보다:

```text
"What does this idea need next?"
```

를 판단해야 한다.

---

# 65. 개발 우선순위

1. Seed state 모델 정의
2. Conversation 저장
3. LLM Provider 연결
4. Grow 엔진
5. Branch 엔진
6. Prune 엔진
7. Bloom/maturity 엔진
8. Tree 렌더링
9. History
10. Harvest
11. PRD
12. TRD
13. Water
14. Sunlight
15. Garden/Wither/Wake
16. 추가 AI Provider
17. Web UI

---

# 66. 최종 요약

Seed는:

> **개발 아이디어를 씨앗으로 생각하고, AI를 정원사처럼 활용해 그 아이디어를 질문과 대화로 키우는 개발자용 CLI 도구다.**

사용자는:

```text
🌱 심고
💧 키우고
🌿 가지를 뻗고
✂️ 가지치기하고
☀️ 현실에 비춰보고
🌳 전체를 보고
🧬 진화시키고
🌸 꽃을 피운 뒤
🍎 필요한 결과물을 수확한다.
```

결과적으로:

```text
모호한 생각
   ↓
명확한 아이디어
   ↓
검증된 방향
   ↓
실행 가능한 프로젝트 정의
```

를 만들어낸다.

그리고 마지막에 필요하면:

```text
🍎 Idea Card
🍎 Brief
🍎 PRD
🍎 TRD
🍎 README
🍎 Coding Prompt
```

를 수확한다.

**Seed는 코드를 대신 만들지 않는다.  
Seed는 무엇을 만들 가치가 있는지 발견하도록 돕는다.**