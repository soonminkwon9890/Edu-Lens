# 에듀렌즈 (Edu-Lens)

> AI Vision + 소크라테스식 교육 — 학생의 화면을 보며 막히는 순간을 실시간으로 감지하고, 정답 대신 생각하는 방법을 안내합니다.

---

## 목차

- [프로젝트 개요](#프로젝트-개요)
- [핵심 기능](#핵심-기능)
- [왜 에듀렌즈인가](#왜-에듀렌즈인가)
- [기술 스택](#기술-스택)
- [시스템 아키텍처](#시스템-아키텍처)
- [시작하기](#시작하기)
- [프로젝트 구조](#프로젝트-구조)
- [문서](#문서)

---

## 프로젝트 개요

에듀렌즈(Edu-Lens)는 부트캠프, 코딩 교육 기관, 온라인 수업에서 학생이 혼자 막히는 순간을 해결하기 위해 설계된 **AI 코파일럿 + 강사 모니터링 플랫폼**입니다.

학생이 학습 카테고리(예: 개발 환경 설정, UI/UX 디자인)를 선택하면, 브라우저가 화면을 30초마다 캡처하여 Gemini AI Vision 모델에 전달합니다. AI는 오류나 막힘을 감지하면 **소크라테스식 3단계 힌트**를 제공하고, 그렇지 않으면 학생이 현재 하고 있는 작업에 대한 **선제적 질문**을 건넵니다. 강사는 별도의 관리자 대시보드에서 담당 학생들의 실시간 학습 현황과 상호작용 타임라인을 확인합니다.

---

## 핵심 기능

### 학생 화면

| 기능 | 설명 |
|------|------|
| **6개 학습 카테고리** | 개발 환경 설정 / UI·UX 디자인 / 제품 기획 / 데이터 분석 / 보안·네트워크 / 일반 학습 |
| **자동 화면 감지** | `getDisplayMedia` API로 30초마다 스크린샷 캡처 → Gemini Vision 분석 |
| **소크라테스식 3단계 힌트** | 오류 감지 시 정답 대신 수준별 힌트 점진적 공개 (Level 1 → 2 → 3) |
| **선제적 AI 제안** | 오류가 없을 때 학생의 현재 작업 맥락을 파악해 자연스러운 질문 제안 |
| **수동 Q&A 채팅** | 언제든 직접 질문 — 화면 컨텍스트를 포함해 AI가 답변 |
| **학습 기록 (Recent Activity)** | 해결된 세션을 카테고리별로 그룹화하여 복습 가능 |
| **멘토 연결** | 닉네임 검색으로 담당 강사를 지정 |

### 강사(관리자) 대시보드

| 기능 | 설명 |
|------|------|
| **수강생 디렉토리** | `profiles` 테이블 기반 정확한 담당 학생 목록 |
| **실시간 세션 상태** | active / stalled / critical 상태 표시 및 위급 알림 |
| **상호작용 타임라인** | 학생별 모든 AI 응답 이력 (카테고리·유형·시각 포함) |
| **차트 분석** | 최근 7일 상호작용 빈도(라인 차트) + 유형 분포(파이 차트) |
| **30초 자동 폴링** | Supabase RLS 우회를 위해 서버 액션 기반 폴링 사용 |

---

## 왜 에듀렌즈인가

### 문제
코딩 교육에서 학생이 막혔을 때 강사에게 직접 질문하기까지 평균 **27분**을 소비한다는 연구가 있습니다. 온라인 환경에서는 이 시간이 더 길어집니다. ChatGPT 같은 기존 AI 도구는 정답을 바로 제공하여 **학습 의존성**을 높입니다.

### 에듀렌즈의 접근

1. **AI Vision 기반 무인 감지** — 학생이 "도움 요청" 버튼을 누르지 않아도 AI가 화면에서 막힘을 스스로 감지합니다.
2. **소크라테스식 교육 철학** — 정답 대신 학생이 스스로 발견하도록 유도하는 질문·힌트를 제공합니다.
3. **도메인 전문가 페르소나** — 카테고리마다 다른 전문가 AI (DevOps 엔지니어, 보안 전문가, 데이터 사이언티스트 등)가 맥락에 맞는 힌트를 제공합니다.
4. **강사 인사이트** — 강사는 어떤 학생이 어떤 유형의 문제에서 반복적으로 막히는지 데이터로 확인합니다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend + SSR** | Next.js 14 (App Router), React 18, TypeScript |
| **Styling** | Tailwind CSS v3, Radix UI (Dialog), Lucide Icons, Recharts |
| **AI Vision** | Google Gemini 2.5 Flash (`@google/generative-ai`) |
| **Database** | Supabase (PostgreSQL) — `profiles`, `active_sessions`, `practice_logs` |
| **Auth** | Clerk v5 (JWT + `publicMetadata` for role-based routing) |
| **Deployment** | Vercel (Serverless Functions) |
| **Screen Capture** | Web `getDisplayMedia` API (브라우저 네이티브) |

---

## 시스템 아키텍처

```
[Student Browser]
      │
      │  getDisplayMedia → JPEG base64
      ▼
[POST /api/analyze]  ←── Next.js Serverless Function (Vercel)
      │
      ├─ Gemini 2.5 Flash (diagnostic model, temp 0.2)
      │   └─ Stall detected? → 3-level Socratic hints
      │   └─ No stall?       → Proactive question
      │
      ├─ Gemini 2.5 Flash (chat model, temp 0.7)
      │   └─ Manual Q&A → contextual answer
      │
      └─ Supabase Admin (service role)
          ├─ UPDATE active_sessions (status escalation)
          └─ INSERT practice_logs

[Admin Dashboard]
      │
      └─ Server Actions (supabaseAdmin)
          ├─ fetchInstructorStudents()  ← profiles table
          ├─ fetchInstructorSessions()  ← active_sessions table
          └─ fetchStudentLogs()         ← practice_logs + join
```

---

## 시작하기

### 사전 요구사항

- Node.js 18+
- Supabase 프로젝트 (테이블 스키마는 `docs/ARCHITECTURE.md` 참고)
- Clerk 애플리케이션
- Google AI Studio API 키 (Gemini)

### 환경 변수 설정

프로젝트 루트의 `web/` 디렉토리에 `.env.local` 파일을 생성합니다.

```bash
# Supabase — 클라이언트용 (공개 가능)
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# Supabase — 서버 전용 (절대 클라이언트에 노출 금지)
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Gemini AI — 서버 전용
GEMINI_API_KEY=<gemini-api-key>

# Clerk — 공개 키
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<publishable-key>
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# Clerk — 서버 전용
CLERK_SECRET_KEY=<secret-key>
CLERK_WEBHOOK_SECRET=<webhook-secret>
```

> **보안 주의**: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `CLERK_SECRET_KEY`는 `NEXT_PUBLIC_` 접두사 없이 선언하여 서버 환경에서만 접근 가능합니다.

### 설치 및 실행

```bash
# 저장소 클론
git clone <repository-url>
cd Edu_Lens/web

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

### Clerk 웹훅 설정

Clerk 대시보드에서 `user.created` 이벤트를 `https://<your-domain>/api/webhooks/clerk`로 전달하도록 설정합니다. 로컬 개발 시 `ngrok` 또는 Clerk의 로컬 터널을 사용하세요.

### 빌드 및 타입 체크

```bash
npm run build        # 프로덕션 빌드
npm run type-check   # TypeScript 오류 검사
npm run lint         # ESLint 검사
```

---

## 프로젝트 구조

```
web/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts        # AI Vision + Gemini 호출 (핵심 API)
│   │   └── webhooks/clerk/route.ts # Clerk user.created 웹훅
│   ├── admin/
│   │   ├── page.tsx                # 강사 대시보드 (클라이언트)
│   │   ├── _components/            # 대시보드 전용 UI 컴포넌트
│   │   └── _lib/                   # 타입 정의 + 차트 데이터 유틸
│   ├── onboarding/page.tsx         # 역할·닉네임 설정 (OAuth 사용자용)
│   ├── sign-in/ sign-up/           # Clerk 인증 페이지
│   ├── actions.ts                  # 서버 액션 (Supabase 쿼리)
│   ├── layout.tsx                  # 루트 레이아웃
│   └── page.tsx                    # 학생 홈 (SSR 데이터 패칭)
├── components/
│   ├── WebEduLensCapture.tsx       # AI 코파일럿 위젯 (핵심 컴포넌트)
│   ├── student/                    # 학생 대시보드 컴포넌트
│   └── ui/dialog.tsx               # Radix Dialog 래퍼
├── lib/
│   ├── supabase.ts                 # 클라이언트용 Supabase (anon key)
│   ├── supabase-server.ts          # 서버용 Supabase (service role)
│   └── utils.ts                    # cn(), timeAgo(), formatTime()
├── middleware.ts                   # Clerk 미들웨어 + 역할 기반 라우팅
└── docs/                           # 프로젝트 문서
```

---

## 문서

| 문서 | 설명 |
|------|------|
| [`docs/PRD.md`](docs/PRD.md) | 제품 요구사항 문서 (문제 정의, 유저 플로우, 성공 지표) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 기술 아키텍처 (DB 스키마, API 설계, 보안 구조) |
| [`docs/AI_INSTRUCTIONS.md`](docs/AI_INSTRUCTIONS.md) | AI 페르소나 + 프롬프트 설계 가이드 |
| [`docs/DEV_LOG.md`](docs/DEV_LOG.md) | 개발 일지 (주요 기술적 도전과 해결 과정) |
