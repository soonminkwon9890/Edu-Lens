# 개발 일지 — 에듀렌즈 (Edu-Lens)

**Version 2.0** | 최종 업데이트: 2026년 4월

주요 기술적 도전과 해결 과정을 기록합니다.

---

## 목차

1. [아키텍처 전환 — Python/AWS → Next.js Serverless](#1-아키텍처-전환--pythonaws--nextjs-serverless)
2. [SSR Hydration 오류 해결](#2-ssr-hydration-오류-해결)
3. [N+1 쿼리 최적화](#3-n1-쿼리-최적화)
4. [TypeScript 타입 브릿지 패턴](#4-typescript-타입-브릿지-패턴)
5. [Clerk + Supabase RLS 비호환 문제](#5-clerk--supabase-rls-비호환-문제)
6. [스크린 캡처 Stale Closure 버그](#6-스크린-캡처-stale-closure-버그)
7. [관리자 대시보드 데이터 파이프라인 버그](#7-관리자-대시보드-데이터-파이프라인-버그)
8. [에스컬레이션 카운트 오염 문제](#8-에스컬레이션-카운트-오염-문제)
9. [세션 상태 동시성 설계](#9-세션-상태-동시성-설계)

---

## 1. 아키텍처 전환 — Python/AWS → Next.js Serverless

### 배경

초기 v1 프로토타입은 Python FastAPI 백엔드(AWS EC2)와 React SPA(S3/CloudFront)로 구성되었습니다. 서버 관리, CORS 설정, 배포 파이프라인 등 인프라 복잡도가 MVP 단계에 불필요하게 높았습니다.

### 문제

- EC2 인스턴스에서 CORS 헤더 설정 누락으로 프론트엔드 API 호출이 전면 차단되었습니다.
- 개발/스테이징/프로덕션 환경 분리 없이 단일 서버를 사용해 환경 변수 관리가 위험했습니다.
- Python 의존성(`uvicorn`, `fastapi`, `google-generativeai`)과 Node.js 의존성이 별도 저장소에 분산되어 개발 흐름이 끊겼습니다.

### 해결

**Full-stack Next.js 14 App Router**로 단일화했습니다:

```
v1 (Python/AWS)                    v2 (Next.js/Vercel)
─────────────────────              ─────────────────────
FastAPI (EC2)           →          app/api/analyze/route.ts
React SPA (S3)          →          Next.js App Router (SSR + CSR 혼합)
EC2 Security Group      →          Vercel Edge Network (자동 CORS)
별도 환경 변수 관리      →          .env.local + Vercel Environment Variables
```

**주요 이점**:
- CORS 문제 완전 제거 (same-origin API routes)
- `export const runtime = "nodejs"` 한 줄로 Gemini SDK 호환성 보장
- Vercel 자동 스케일링으로 서버 관리 불필요
- Server Components와 API routes가 동일 코드베이스에서 타입 공유

---

## 2. SSR Hydration 오류 해결

### 문제

`WebEduLensCapture` 컴포넌트가 Next.js 14의 SSR(Server-Side Rendering) 단계에서 실행되면서 두 가지 React hydration 오류(#418, #423)가 발생했습니다.

**근본 원인**: `getDisplayMedia`, `MediaStream`, `HTMLVideoElement` 등 브라우저 전용 API가 Node.js SSR 환경에 존재하지 않습니다. 서버 렌더링 결과와 클라이언트 hydration 결과가 다르면 React가 hydration 오류를 발생시킵니다.

### 해결

`CategoryGrid.tsx`에서 동적 임포트(dynamic import)로 SSR을 비활성화했습니다:

```typescript
// Before: 직접 임포트 → SSR 단계에서 실행되어 오류 발생
import WebEduLensCapture from "@/components/WebEduLensCapture";

// After: ssr: false로 클라이언트에서만 렌더링
const WebEduLensCapture = dynamic(
  () => import("@/components/WebEduLensCapture"),
  { ssr: false }
);
```

`ssr: false`는 컴포넌트를 서버 렌더링에서 완전히 제외하고 클라이언트 번들에만 포함시킵니다. 화면 캡처 위젯은 항상 사용자 상호작용 후 마운트되므로 초기 렌더링 성능에 영향이 없습니다.

---

## 3. N+1 쿼리 최적화

### 문제

학생 홈(`app/page.tsx`)의 "최근 활동" 섹션에서 N+1 쿼리 패턴이 발생했습니다:

```typescript
// Before: 세션 수(N)만큼 DB 쿼리 발생
const recentSessions = await Promise.all(
  sessions.map(async (session) => {
    const { data: log } = await supabaseAdmin
      .from("practice_logs")
      .select("error_type, ai_hint")
      .eq("session_id", session.id)    // ← 세션당 1번 쿼리
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { ...session, ...log };
  })
);
```

해결된 세션이 100개이면 101번의 DB 왕복이 발생합니다. Supabase 무료 플랜의 연결 제한에 걸릴 수 있고, 응답 시간도 선형으로 증가합니다.

### 해결

단일 배치 쿼리 + 클라이언트 측 그룹화로 대체했습니다:

```typescript
// After: 쿼리 2번으로 고정 (세션 목록 1번 + 로그 전체 1번)
const { data: logs } = await supabaseAdmin
  .from("practice_logs")
  .select("session_id, error_type, ai_hint, created_at")
  .in("session_id", sessionRows.map((s) => s.id))  // ← IN 연산자로 배치 조회
  .order("created_at", { ascending: false });

// 클라이언트에서 세션별 최신 로그 추출
const latestLogBySession: Record<string, { error_type: string | null; ai_hint: string | null }> = {};
for (const log of logs ?? []) {
  if (!latestLogBySession[log.session_id]) {       // ← 이미 newest-first 정렬이므로 첫 번째가 최신
    latestLogBySession[log.session_id] = {
      error_type: log.error_type,
      ai_hint:    log.ai_hint,
    };
  }
}
```

**결과**: DB 쿼리 횟수가 N+1에서 2로 감소. 세션 수와 무관하게 일정한 응답 시간을 보장합니다.

---

## 4. TypeScript 타입 브릿지 패턴

### 문제

Server Actions는 직렬화 안전성을 위해 반환 타입을 `Promise<Record<string, unknown>[]>`로 선언해야 합니다. 그러나 클라이언트 컴포넌트에서 이를 도메인 타입으로 캐스팅하면 TypeScript가 오류를 발생시켰습니다:

```
Conversion of type 'Record<string, unknown>[]' to type 'ActiveSession[]'
may be a mistake because neither type sufficiently overlaps with the other.
```

`Record<string, unknown>`은 인덱스 시그니처로, `ActiveSession`의 구체적 프로퍼티와 구조적으로 겹치는 부분이 없습니다.

### 해결

`as unknown as T` 더블 캐스팅 패턴을 사용합니다:

```typescript
// 한 번에 캐스팅 시도 → TypeScript 오류
const sessions = data as ActiveSession[];        // ❌

// unknown을 경유한 더블 캐스팅 → 컴파일러 우회
const sessions = data as unknown as ActiveSession[];  // ✅
```

**원리**: `unknown`은 TypeScript의 최상위 타입이므로 모든 타입으로의 캐스팅을 허용합니다. `as unknown`으로 타입 체크를 해제한 뒤 `as T`로 원하는 타입을 지정합니다. 이는 개발자가 런타임 데이터 형태를 보장할 때 의도적으로 사용하는 패턴입니다.

---

## 5. Clerk + Supabase RLS 비호환 문제

### 문제

Supabase Row Level Security(RLS)는 `auth.uid()` 함수로 현재 사용자를 식별합니다. 이는 Supabase 자체 Auth 시스템에서만 동작합니다. 에듀렌즈는 Clerk으로 인증하므로 Supabase의 `auth.uid()`는 항상 `null`을 반환합니다.

결과적으로 RLS 정책이 적용된 테이블에서 Clerk 사용자는 어떤 행도 조회/삽입할 수 없었습니다.

### 해결

두 계층의 Supabase 클라이언트를 분리합니다:

| 클라이언트 | 파일 | 키 | 용도 |
|-----------|------|----|------|
| `supabase` | `lib/supabase.ts` | anon key | 클라이언트 컴포넌트 (향후 RLS 구성 시 대비) |
| `supabaseAdmin` | `lib/supabase-server.ts` | service role key | 서버 액션 + API routes (RLS 완전 우회) |

모든 민감한 데이터 조회는 `supabaseAdmin`을 사용하는 Server Actions를 통해서만 이루어지며, Server Actions 내부에서 반드시 `auth()` (Clerk)로 인증을 검증합니다:

```typescript
export async function fetchInstructorStudents() {
  const { userId } = await auth();    // Clerk으로 인증 확인
  if (!userId) throw new Error("Unauthorized");

  return supabaseAdmin                // service role로 RLS 우회
    .from("profiles")
    .select(...)
    .eq("mentor_id", userId);
}
```

**보안 설계**: `SUPABASE_SERVICE_ROLE_KEY`는 `NEXT_PUBLIC_` 접두사 없이 선언되어 클라이언트 번들에 절대 포함되지 않습니다.

---

## 6. 스크린 캡처 Stale Closure 버그

### 문제

`WebEduLensCapture` 컴포넌트에서 `setInterval`로 30초마다 `runAutoCapture`를 호출합니다. 그러나 `setInterval`의 콜백은 생성 시점의 함수 참조를 캡처(클로저)하므로, `runAutoCapture`가 `useEffect` 의존성 변경으로 재생성되어도 인터벌은 구 버전 함수를 계속 호출했습니다.

**증상**: 카테고리를 변경하거나 세션 ID가 갱신되어도 이전 세션의 데이터로 API를 계속 호출했습니다.

### 해결

`useRef`로 항상 최신 함수를 가리키는 포인터를 유지합니다:

```typescript
const runAutoRef = useRef<(() => Promise<void>) | null>(null);

// 매 렌더링마다 ref를 최신 함수로 업데이트
runAutoRef.current = runAutoCapture;

// 인터벌은 ref.current를 호출하므로 항상 최신 함수 실행
const intervalId = setInterval(() => {
  runAutoRef.current?.();
}, AUTO_INTERVAL_MS);
```

**원리**: `setInterval`의 콜백 자체는 변경되지 않으므로 stale closure가 발생하지 않습니다. 대신 콜백이 `ref.current`를 통해 간접적으로 최신 함수를 호출합니다.

---

## 7. 관리자 대시보드 데이터 파이프라인 버그

### 문제

강사 대시보드의 "담당 수강생" 수가 항상 0으로 표시되었습니다.

**원인 추적**: `fetchInstructorStudents()` Server Action이 `.eq("role", "학생")`으로 쿼리했으나, `profiles` 테이블에는 온보딩 플로우에서 저장한 영문 값 `"student"`가 저장되어 있었습니다.

```typescript
// Before: 한국어로 비교 → 항상 0건 반환
.eq("role", "학생")

// After: 실제 저장된 영문 값으로 비교
.eq("role", "student")
```

**재발 방지**: DB에 저장되는 값(온보딩 페이지의 `role` 필드)과 쿼리에서 사용하는 값을 동일 상수로 관리합니다.

---

## 8. 에스컬레이션 카운트 오염 문제

### 문제

선제적 조언(`"선제적 조언"`)과 수동 Q&A(`"질의응답"`) 상호작용도 `practice_logs`에 저장된 이후, 세션 위급도(critical) 계산이 왜곡되었습니다.

`saveStallEvent`는 이전 로그 수가 3 이상이면 세션을 `critical`로 에스컬레이션합니다. 그런데 오류가 전혀 없어도 선제적 조언 3건이 쌓이면 세션이 `critical`이 되는 문제가 발생했습니다.

### 해결

에스컬레이션 카운트 쿼리에서 비-오류 타입을 명시적으로 제외합니다:

```typescript
const { count } = await supabaseAdmin
  .from(LOGS_TABLE)
  .select("id", { count: "exact", head: true })
  .eq("session_id", sessionId)
  .not("error_type", "in", '("선제적 조언","질의응답")');  // 비-오류 상호작용 제외
```

**결과**: 실제 오류(`syntax`/`tool_usage`/`config`/`unknown`)가 3회 이상 감지될 때만 세션이 `critical` 상태로 변경됩니다.

---

## 9. 세션 상태 동시성 설계

### 배경

학생이 동시에 여러 카테고리 세션을 열 수 없도록 단일 활성 세션 제약이 필요했습니다. 이를 UI 레이어에서만 처리하면 빠른 연속 클릭이나 새로고침 시 레이스 컨디션이 발생할 수 있습니다.

### 설계 결정

두 계층에서 동시에 제약합니다:

**DB 레이어**: `active_sessions` 테이블에 `(student_id, status)` 복합 인덱스와 함께, 동일 학생의 중복 활성 세션 생성을 방지하는 `upsert` 패턴을 사용합니다.

**UI 레이어**: `captureSession` 상태가 `null`이 아니면 다른 카테고리 카드의 "시작" 버튼을 비활성화합니다:

```typescript
// CategoryGrid.tsx
const isOtherCategoryActive = captureSession !== null && captureSession.category !== category;

<button
  disabled={isOtherCategoryActive}
  ...
>
  감지 시작
</button>
```

사용자에게는 "다른 세션이 활성화되어 있습니다" 메시지로 명확히 안내하여 혼란을 방지합니다.
