# Technical Architecture — 에듀렌즈 (Edu-Lens)

---

## 목차

1. [아키텍처 전환 히스토리](#1-아키텍처-전환-히스토리)
2. [현재 아키텍처 전체 구조](#2-현재-아키텍처-전체-구조)
3. [데이터 파이프라인](#3-데이터-파이프라인)
4. [Supabase 스키마](#4-supabase-스키마)
5. [API 설계](#5-api-설계)
6. [인증 및 보안 구조](#6-인증-및-보안-구조)
7. [서버 액션 패턴](#7-서버-액션-패턴)
8. [프론트엔드 컴포넌트 구조](#8-프론트엔드-컴포넌트-구조)

---

## 1. 아키텍처 전환 히스토리

### v1.0 — Python / AWS 아키텍처 (초기)

초기 설계에서는 화면 캡처와 AI 분석을 별도의 Python 데스크톱 에이전트가 처리했습니다.

```
[Desktop Agent (Python)]
    │  - 화면 캡처 (Pillow)
    │  - Gemini API 직접 호출
    ▼
[FastAPI Server (AWS EC2)]
    │  POST /analyze
    ▼
[Supabase]
```

**한계점**:
- 데스크톱 앱 설치 필요 → 배포 마찰
- AWS EC2 관리 오버헤드 및 비용
- CORS 설정 복잡성
- 브라우저와 데스크톱 에이전트 간 동기화 문제
- getDisplayMedia는 브라우저 전용 API이므로 결국 브라우저 측 캡처가 필요

### v2.0 — Next.js Serverless 아키텍처 (현재)

모든 로직을 Next.js로 통합하여 **단일 배포 단위**로 재설계했습니다.

```
[Browser]
    │  getDisplayMedia → JPEG base64
    ▼
[Next.js on Vercel]
    ├─ /api/analyze (Serverless Function)
    └─ Server Actions
    ▼
[Supabase]
```

**장점**:
- 설치 불필요 — 브라우저에서 바로 실행
- Vercel 자동 스케일 — 서버 관리 없음
- 환경 변수 Vercel 대시보드에서 안전하게 관리
- 단일 코드베이스로 프론트엔드/백엔드 통합 관리

---

## 2. 현재 아키텍처 전체 구조

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel Edge Network                    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Next.js 14 App Router               │    │
│  │                                                  │    │
│  │  Server Components    Client Components          │    │
│  │  ├─ app/page.tsx      ├─ StudentDashboard        │    │
│  │  ├─ app/layout.tsx    ├─ WebEduLensCapture        │    │
│  │  └─ data fetching     └─ AdminPage               │    │
│  │                                                  │    │
│  │  Server Actions             API Routes           │    │
│  │  └─ app/actions.ts          └─ /api/analyze      │    │
│  │     (supabaseAdmin)            (Gemini Vision)   │    │
│  └─────────────────────────────────────────────────┘    │
│           │                          │                   │
└───────────┼──────────────────────────┼───────────────────┘
            │                          │
            ▼                          ▼
    ┌───────────────┐        ┌──────────────────┐
    │   Supabase    │        │  Google Gemini   │
    │  PostgreSQL   │        │  2.5 Flash API   │
    │               │        │                  │
    │ - profiles    │        │ - diagnosticModel│
    │ - sessions    │        │   (temp 0.2)     │
    │ - logs        │        │ - chatModel      │
    └───────────────┘        │   (temp 0.7)     │
                             └──────────────────┘
            │
            ▼
    ┌───────────────┐
    │  Clerk Auth   │
    │               │
    │ - JWT claims  │
    │ - publicMeta  │
    │   (role,nick) │
    └───────────────┘
```

---

## 3. 데이터 파이프라인

### 자동 분석 사이클 (30초마다)

```
1. [Browser] setInterval(30s)
        │
        ▼
2. [WebEduLensCapture.tsx] captureFrame()
   canvas.drawImage(video) → toDataURL("image/jpeg", 0.85)
   → base64 string (data URL prefix 제거)
        │
        ▼
3. [POST /api/analyze] body:
   {
     image_base64: string,   // JPEG base64
     student_id:   string,   // Clerk userId
     session_id:   string,   // active_sessions.id
     category:     string,   // 학습 카테고리 ID
     request_type: "auto"
   }
        │
        ▼
4. [route.ts] getModels(category)
   → category로 ExpertDomain 조회
   → buildDiagnosticPrompt(domain) 생성
   → Gemini diagnosticModel.generateContent([prompt, imagePart])
        │
        ├─ no_stall: true
        │       │
        │       ▼
        │  runProactive(chatModel, imagePart)
        │  → INSERT practice_logs (error_type: "선제적 조언")
        │  → { response_type: "proactive", message }
        │
        └─ no_stall: false
                │
                ▼
           saveStallEvent(studentId, sessionId, errorType, hint)
           → COUNT prior stall logs (excluding "선제적 조언", "질의응답")
           → status = count+1 >= 3 ? "critical" : "stalled"
           → UPDATE active_sessions SET status = newStatus
           → INSERT practice_logs
           → { response_type: "error", message, message_2, message_3 }
```

### 수동 Q&A 파이프라인

```
1. [Student] 텍스트 입력 → Enter
        │
        ▼
2. captureFrame() → 현재 화면 캡처
        │
        ▼
3. POST /api/analyze { request_type: "manual", user_prompt: "..." }
        │
        ▼
4. runManualQA(chatModel, imagePart, userPrompt)
   → INSERT practice_logs (error_type: "질의응답")
   → { response_type: "answer", message }
```

---

## 4. Supabase 스키마

### profiles

```sql
CREATE TABLE profiles (
  id          TEXT PRIMARY KEY,        -- Clerk userId
  role        TEXT NOT NULL,           -- 'student' | 'instructor'
  nickname    TEXT NOT NULL,
  mentor_id   TEXT REFERENCES profiles(id) ON DELETE SET NULL
);
```

- Clerk `user.created` 웹훅이 행을 생성합니다.
- 온보딩 완료 시 `saveOnboarding()` 서버 액션이 upsert합니다.
- `mentor_id`는 학생이 강사를 연결할 때 `setMentor()` 서버 액션으로 설정됩니다.

### active_sessions

```sql
CREATE TABLE active_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  TEXT NOT NULL REFERENCES profiles(id),
  mentor_id   TEXT NOT NULL REFERENCES profiles(id),
  category    TEXT NOT NULL,           -- 학습 카테고리 ID
  status      TEXT NOT NULL DEFAULT 'active',
                                       -- 'active' | 'stalled' | 'critical' | 'resolved'
  started_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

- 학생이 카테고리 카드를 클릭하면 `createSession()` 서버 액션으로 생성됩니다.
- 동일 (student_id, category) 조합의 열린 세션이 있으면 재사용합니다.
- 오류 감지 시 `status`가 `stalled` → `critical`로 에스컬레이션됩니다.
- "세션 종료" 클릭 시 `resolveSession()`으로 `resolved` 처리됩니다.

### practice_logs

```sql
CREATE TABLE practice_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     TEXT NOT NULL REFERENCES profiles(id),
  session_id     UUID NOT NULL REFERENCES active_sessions(id),
  error_type     TEXT,                 -- 'syntax'|'tool_usage'|'config'|'선제적 조언'|'질의응답'
  ai_hint        TEXT,                 -- AI가 생성한 응답 (Level 1 힌트 또는 답변)
  screenshot_url TEXT,                 -- (선택) 스크린샷 저장 URL
  created_at     TIMESTAMPTZ DEFAULT now()
);
```

- 모든 AI 상호작용(오류, 선제적 조언, 질의응답)이 기록됩니다.
- `error_type`의 Korean 값(`"선제적 조언"`, `"질의응답"`)은 에스컬레이션 카운트에서 제외됩니다.

### RLS (Row Level Security)

Supabase의 RLS는 `auth.uid()`를 기반으로 동작하지만, 이 프로젝트는 Clerk를 인증 시스템으로 사용하므로 `auth.uid()`가 항상 `null`입니다. 이를 해결하기 위해:

- **클라이언트 코드**: anon key로 생성된 `supabase` 클라이언트 — RLS가 적용되므로 직접 쿼리 불가
- **서버 코드**: service role key로 생성된 `supabaseAdmin` — RLS 우회, `auth()` 검증으로 보안 확보
- **관리자 대시보드**: Server Actions(`fetchInstructorSessions` 등)를 통해서만 데이터 접근

---

## 5. API 설계

### POST /api/analyze

`app/api/analyze/route.ts` | `export const runtime = "nodejs"`

**Request Body**:
```typescript
{
  image_base64: string,       // JPEG base64 (data URL prefix 선택적)
  student_id:   string,       // Clerk userId
  session_id:   string,       // active_sessions UUID
  category:     string,       // 학습 카테고리 ID
  request_type?: "auto" | "manual",  // 기본값: "auto"
  user_prompt?:  string       // manual 모드에서 필수
}
```

**Response — Stall Detected**:
```typescript
{
  success:        true,
  response_type:  "error",
  message:        string,     // hint_level_1
  message_2:      string,     // hint_level_2
  message_3:      string,     // hint_level_3
  error_type:     "syntax" | "tool_usage" | "config",
  session_status: "stalled" | "critical"
}
```

**Response — No Stall (Proactive)**:
```typescript
{
  success:       true,
  response_type: "proactive",
  message:       string       // 선제적 질문 한 문장
}
```

**Response — Manual Q&A**:
```typescript
{
  success:       true,
  response_type: "answer",
  message:       string       // AI 답변
}
```

**Gemini 모델 구성**:

| 모델 역할 | Temperature | 용도 |
|-----------|-------------|------|
| `diagnosticModel` | 0.2 | 오류 감지 — 일관되고 정확한 JSON 출력 필요 |
| `chatModel` | 0.7 | 선제적 제안 + Q&A — 자연스러운 대화 필요 |

### POST /api/webhooks/clerk

`app/api/webhooks/clerk/route.ts`

- Svix 서명 검증 (`CLERK_WEBHOOK_SECRET`)
- `user.created` 이벤트 처리
- Supabase `profiles` 테이블에 upsert (중복 웹훅 배달 방어)
- Clerk `publicMetadata`에 role 승격 (이후 JWT에 포함)

---

## 6. 인증 및 보안 구조

### Clerk + Next.js 미들웨어

```
모든 요청 → middleware.ts
    │
    ├─ isPublicRoute? (/sign-in, /sign-up, /api/webhooks/clerk)
    │   └─ 통과
    │
    ├─ 미인증? → /sign-in 리다이렉트
    │
    ├─ role 없음 (OAuth 신규 가입)?
    │   └─ /onboarding 리다이렉트
    │
    ├─ instructor + /에 접근 → /admin 리다이렉트
    │
    └─ student + /admin에 접근 → / 리다이렉트
```

**JWT Claims 구조**:
```typescript
sessionClaims.metadata = {
  role:     "instructor" | "student",
  nickname: string
}
```

### 환경 변수 보안

| 변수 | 접근 범위 | 용도 |
|------|----------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 클라이언트+서버 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트+서버 | RLS 적용 anon 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 | RLS 우회 admin 키 |
| `GEMINI_API_KEY` | 서버 전용 | Gemini Vision API |
| `CLERK_SECRET_KEY` | 서버 전용 | Clerk 서버 작업 |
| `CLERK_WEBHOOK_SECRET` | 서버 전용 | Svix 서명 검증 |

`NEXT_PUBLIC_` 접두사가 없는 변수들은 Vercel의 서버 런타임에서만 접근 가능하며, 클라이언트 번들에 포함되지 않습니다.

---

## 7. 서버 액션 패턴

모든 서버 액션은 `app/actions.ts`에 정의되며 `"use server"` 지시어를 사용합니다.

```typescript
// 패턴: auth() → supabaseAdmin 순서
export async function exampleAction(): Promise<Result> {
  const { userId } = await auth();       // 1. 인증 확인
  if (!userId) throw new Error("Unauthorized");

  const { data, error } = await supabaseAdmin  // 2. 서비스 롤로 DB 접근
    .from("table")
    .select("*")
    .eq("user_id", userId);              // 3. 항상 userId로 스코핑

  if (error) throw new Error(error.message);
  return data;
}
```

**관리자 대시보드 데이터 흐름**:

```
AdminPage (Client Component, 30s polling)
    │
    ├─ fetchInstructorStudents()   → profiles WHERE role='student' AND mentor_id=me
    ├─ fetchInstructorSessions()   → active_sessions WHERE mentor_id=me
    ├─ fetchInstructorLogs()       → practice_logs WHERE session_id IN (sessions)
    └─ fetchStudentLogs(studentId) → practice_logs JOIN active_sessions(category)
                                     WHERE student_id=studentId AND mentor_id=me
```

**N+1 방지 패턴** (`app/page.tsx`):

```typescript
// 잘못된 방법 (N+1):
// sessions.map(async (s) => await supabase.from("practice_logs").eq("session_id", s.id))

// 올바른 방법 (batch):
const { data: logs } = await supabaseAdmin
  .from("practice_logs")
  .in("session_id", sessionIds)         // 단일 IN 쿼리
  .order("created_at", { ascending: false });

// 클라이언트 측 그루핑
for (const log of logs) {
  if (!latestLogBySession[log.session_id]) {
    latestLogBySession[log.session_id] = log;
  }
}
```

---

## 8. 프론트엔드 컴포넌트 구조

### WebEduLensCapture.tsx (핵심 컴포넌트)

```
WebEduLensCapture
├─ Refs
│   ├─ videoRef      — getDisplayMedia 스트림 수신
│   ├─ canvasRef     — 프레임 캡처용 오프스크린 캔버스
│   ├─ streamRef     — MediaStream 참조 (cleanup용)
│   ├─ intervalRef   — 30초 자동 분석 인터벌
│   ├─ tickRef       — 1초 카운트다운 인터벌
│   └─ runAutoRef    — stale closure 방지용 최신 함수 참조
│
├─ State
│   ├─ status        — idle | requesting | active | paused | error
│   ├─ messages      — ChatMessage[] (대화 이력)
│   ├─ countdown     — 다음 분석까지 남은 시간
│   └─ analysedN     — 누적 분석 횟수
│
└─ MessageBubble (sub-component)
    ├─ loading    — 점 세 개 애니메이션
    ├─ user       — 오른쪽 정렬 버블
    ├─ system     — 중앙 정렬 시스템 메시지
    ├─ answer     — AI 답변 버블
    ├─ error      — 3단계 힌트 + "다음 단계 보기" 버튼
    └─ proactive  — 선제적 질문 + Yes/No 버튼
```

**Stale Closure 해결 패턴**:

```typescript
// setInterval 내부에서 항상 최신 runAutoCapture를 호출하기 위해 ref 사용
const runAutoRef = useRef<() => Promise<void>>();
runAutoRef.current = runAutoCapture;  // 매 렌더마다 최신화

intervalRef.current = setInterval(() => {
  void runAutoRef.current?.();        // 항상 최신 함수 참조
}, INTERVAL_MS);
```

### Admin 컴포넌트 구조

```
AdminPage (Client, 30s polling)
├─ MetricCard × 3          — 요약 지표
├─ ErrorLineChart           — Recharts 라인 차트
├─ ErrorPieChart            — Recharts 파이 차트
└─ [timelineStudent == null]
    └─ StudentDirectoryCard × N  — 수강생 카드 그리드
        └─ isSessionActive prop  — 실시간 에듀렌즈 사용 표시
   [timelineStudent != null]
    └─ StudentTimeline           — 개별 상호작용 타임라인
        └─ fetchStudentLogs()    — 마운트 시 데이터 패치
```
