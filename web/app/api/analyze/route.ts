/**
 * POST /api/analyze
 * =================
 * Serverless translation of the Python api_server.py logic.
 *
 * request_type == "auto"
 *   → Run stall detection (diagnostic model, temp 0.2).
 *     Stall found   → log to Supabase, return { response_type: "error", ... }
 *     No stall      → run proactive inference, return { response_type: "proactive", ... }
 *
 * request_type == "manual"
 *   → Answer user_prompt with screen as context (chat model, temp 0.7).
 *     Return { response_type: "answer", message: "..." }
 *
 * Required env vars (server-side, NOT prefixed with NEXT_PUBLIC_):
 *   GEMINI_API_KEY
 *   SUPABASE_SERVICE_ROLE_KEY   (already used by supabase-server.ts)
 *   NEXT_PUBLIC_SUPABASE_URL    (already in .env.local)
 */

import { NextResponse }         from "next/server";
import { GoogleGenerativeAI }   from "@google/generative-ai";
import { supabaseAdmin }        from "@/lib/supabase-server";

// ── Runtime ───────────────────────────────────────────────────────────────────
// Explicitly opt into Node.js (not Edge) so the Gemini SDK and Buffer APIs work.
export const runtime = "nodejs";

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSIONS_TABLE     = "active_sessions";
const LOGS_TABLE         = "practice_logs";
const CRITICAL_THRESHOLD = 3;

// ── Error-type classification (mirrors Python _ERROR_TYPE_PATTERNS) ───────────

const ERROR_TYPE_PATTERNS: [RegExp, string][] = [
  [/syntax|parse|indent|typo|misspell|bracket|parenthes/i, "syntax"],
  [/tool|usage|api|import|call|method|function|library/i,  "tool_usage"],
  [/config|setting|env|variable|permission|path|install/i, "config"],
];

function parseErrorType(raw: string): string {
  for (const [pattern, type] of ERROR_TYPE_PATTERNS) {
    if (pattern.test(raw)) return type;
  }
  return "unknown";
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

function stripFences(text: string): string {
  text = text.trim();
  if (text.startsWith("```")) {
    const lines = text.split("\n").slice(1); // drop opening fence line
    if (lines[lines.length - 1].trim() === "```") lines.pop();
    text = lines.join("\n").trim();
  }
  return text;
}

function parseJsonSafe(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Fall back: extract the outermost {...} in case of surrounding noise
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error(`Cannot parse JSON from: ${raw.slice(0, 120)}`);
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  }
}

// ── Expert domain definitions ─────────────────────────────────────────────────
// Keyed by the category IDs used in CategoryGrid.tsx / active_sessions.category.

interface ExpertDomain {
  /** One-line persona declaration — who the AI is in this domain. */
  persona: string;
  /** Specific tools, concepts, and sub-topics the AI commands. */
  focus:   string;
}

const EXPERT_SYSTEM_PROMPTS: Record<string, ExpertDomain> = {
  // "개발 환경 설정"
  "dev-setup": {
    persona: "당신은 10년 경력의 DevOps 엔지니어이자 시스템 아키텍트입니다.",
    focus:
      "IDE 설정(VS Code, IntelliJ), 패키지 매니저(npm/pip/brew/apt), " +
      "PATH·환경 변수 충돌, 파일 권한 문제, dotfile 관리, " +
      "Docker·가상 환경 설정에 대한 깊은 전문 지식을 보유하고 있습니다.",
  },
  // "UI/UX 디자인"
  "uiux": {
    persona: "당신은 글로벌 테크 기업 출신의 시니어 프로덕트 디자이너입니다.",
    focus:
      "Figma 컴포넌트 시스템·오토레이아웃, 디자인 토큰, " +
      "WCAG 접근성 기준, 사용자 플로우 설계, 인터랙션 패턴, " +
      "디자인 시스템 구축 방법론에 전문성을 가지고 있습니다.",
  },
  // "제품 기획"
  "product": {
    persona: "당신은 스타트업과 대기업 경험을 겸비한 시니어 프로덕트 매니저(PM)입니다.",
    focus:
      "PRD 작성, 사용자 스토리 매핑, OKR·KPI 설정, " +
      "로드맵 우선순위 결정(RICE·MoSCoW), 데이터 기반 의사결정 프레임워크를 " +
      "가르치는 것이 전문입니다.",
  },
  // "데이터 분석"
  "data-analysis": {
    persona: "당신은 데이터 사이언티스트이자 통계학 전공 교수입니다.",
    focus:
      "Python(pandas·numpy·matplotlib·seaborn·scikit-learn), " +
      "SQL 쿼리 최적화, 통계적 유의성 검증, 데이터 시각화 원칙, " +
      "편향 탐지 및 모델 해석 가능성에 깊은 전문성을 가지고 있습니다.",
  },
  // "보안 & 네트워크"
  "security": {
    persona: "당신은 원칙에 엄격한 사이버보안 전문가입니다.",
    focus:
      "OWASP Top 10 취약점, HTTPS·TLS 설정, 방화벽·보안 그룹 규칙, " +
      "인증·인가 패턴(OAuth2·JWT), 시큐어 코딩 원칙에 대한 전문 지식을 보유하고 있습니다. " +
      "보안 문제에는 절대 타협하지 않으며, 취약점을 정확히 짚어냅니다.",
  },
  // "일반 학습"
  "general": {
    persona: "당신은 컴퓨터 공학과 교수입니다.",
    focus:
      "알고리즘·자료구조, CS 기초 이론(운영체제·네트워크·데이터베이스), " +
      "클린 코드 원칙, 코딩 문제 해결 방법론을 가르치는 것이 전문입니다.",
  },
};

/** Resolves any unknown or missing category to the general-purpose domain. */
function getExpertDomain(category: string): ExpertDomain {
  return EXPERT_SYSTEM_PROMPTS[category] ?? EXPERT_SYSTEM_PROMPTS["general"];
}

// ── Universal Socratic rules ──────────────────────────────────────────────────
// Appended to every chat prompt regardless of domain.

const SOCRATIC_RULES = `
━━ 답변 원칙 (반드시 준수) ━━

• 소크라테스식 유도: 직접적인 정답을 먼저 제시하지 마세요.
  학생이 스스로 생각하고 발견할 수 있도록 안내하는 질문이나 힌트를 먼저 제공하세요.
• 전문성 발휘: 위의 전문 분야 지식을 활용하여 구체적이고 실질적인 힌트를 제공하세요.
• 따뜻한 격려: 항상 따뜻하고 격려하는 한국어 톤을 유지하세요. 학생의 시도 자체를 인정해 주세요.
• 간결함: 답변은 3~5문장으로 간결하게 유지하세요.
• 순수 텍스트: 마크다운 기호(*, **, #, \`, •)는 사용하지 마세요. 순수 한국어 텍스트로만 작성하세요.`;

// ── Diagnostic prompt core ────────────────────────────────────────────────────
// Domain-agnostic visual rubric — prepended with the expert persona at runtime.

const DIAGNOSTIC_CORE = `당신은 지금 Edu-Lens의 정밀 학습 진단 엔진 역할도 겸합니다.
프로그래밍을 배우는 한국 학생의 스크린샷을 분석하여, 진행을 가로막는 '학습 정체(Stall)' 지점을 찾아내세요.
당신의 전문 분야 지식을 활용하여 도메인 맥락에 맞는 정확한 힌트를 제공하세요.

══ 진단 루브릭 (이 순서대로 확인하세요) ══

[시각적 단서 — 최우선 탐색 대상]
• 빨간 물결 밑줄 (구문 오류 표시)
• 터미널/콘솔의 빨간 텍스트 또는 오류 메시지
• "Error", "Exception", "Traceback", "Failed", "FAILED", "404", "403", "500",
  "undefined", "null", "NullPointer", "ModuleNotFoundError", "SyntaxError", "TypeError" 등의 키워드
• 노란/주황 경고 아이콘 또는 밑줄
• 회색으로 비활성화된 버튼이나 클릭 불가 요소

[컨텍스트별 탐색 전략]
• 터미널/콘솔이 활성화된 경우 → 화면 하단 5~10줄에 집중 (가장 최근 오류)
• 코드 에디터가 활성화된 경우 → 구문 강조 색상 이상, 빨간 밑줄, 들여쓰기 오류
• 브라우저가 활성화된 경우   → HTTP 오류 코드, DevTools 콘솔 오류
• 화면 전체 또는 잘린 창일 수 있음 — 보이는 영역 내에서만 판단

[학습 정체 분류]
• syntax    : 구문 오류, 오타, 잘못된 들여쓰기, 괄호 불일치
• tool_usage: 잘못된 API 호출, 누락된 임포트, 잘못된 메서드/함수 사용
• config    : 환경 설정 오류, 누락된 환경변수, 패키지 미설치, 경로 오류

══ 출력 규칙 ══

① 학습 정체가 발견된 경우 — 아래 JSON만 반환 (마크다운 없이):
{
  "error_type": "syntax|tool_usage|config",
  "problem_location": [ymin, xmin, ymax, xmax],
  "hint_level_1": "<한 문장 방향 힌트. 따뜻하고 격려하는 한국어>",
  "hint_level_2": "<구체적 원인 + 해결 방법. 당신의 전문 도메인 지식을 활용한 한국어>",
  "hint_level_3": "<더 깊은 개념 설명 또는 다음 단계 안내. 도메인 심화 학습 유도>"
}

② 학습 정체가 없는 경우 — 아래 JSON만 반환:
{"no_stall": true}

JSON 외의 텍스트, 마크다운 펜스, 설명은 절대 포함하지 마세요.`;

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildDiagnosticPrompt(domain: ExpertDomain): string {
  return `${domain.persona}\n${domain.focus}\n\n${DIAGNOSTIC_CORE}`;
}

function buildChatPrompt(domain: ExpertDomain): string {
  return (
    `${domain.persona}\n${domain.focus}\n\n` +
    `당신은 지금 Edu-Lens 플랫폼에서 학생의 화면을 보며 맞춤형 도움을 제공하고 있습니다.` +
    SOCRATIC_RULES
  );
}

// ── Gemini model factory ──────────────────────────────────────────────────────
// Models are created per-request (serverless). GoogleGenerativeAI is lightweight.

function getModels(category: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not set.");

  const domain = getExpertDomain(category);
  const genAI  = new GoogleGenerativeAI(apiKey);

  const diagnosticModel = genAI.getGenerativeModel({
    model:             "gemini-2.5-flash",
    systemInstruction: buildDiagnosticPrompt(domain),
    generationConfig:  { temperature: 0.2 },
  });

  const chatModel = genAI.getGenerativeModel({
    model:             "gemini-2.5-flash",
    systemInstruction: buildChatPrompt(domain),
    generationConfig:  { temperature: 0.7 },
  });

  return { diagnosticModel, chatModel };
}

// ── Gemini call helpers ───────────────────────────────────────────────────────

type InlineImagePart = {
  inlineData: { mimeType: "image/jpeg"; data: string };
};

type DiagnosticResult =
  | { no_stall: true }
  | {
      no_stall:     false;
      error_type:   string;
      hint_level_1: string;
      hint_level_2: string;
      hint_level_3: string;
    };

async function runDiagnostic(
  model:     ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  imagePart: InlineImagePart,
): Promise<DiagnosticResult> {
  const prompt =
    "이 이미지는 학생의 화면 캡처입니다. " +
    "일반적인 deprecation warning은 무시하고, " +
    "실제 실행을 막는 오류나 문제에만 집중하세요. " +
    "학습 정체 지점을 찾아 진단 JSON을 반환하세요. " +
    '문제가 없으면 {"no_stall": true}를 반환하세요.';

  const result = await model.generateContent([prompt, imagePart]);
  const raw    = stripFences(result.response.text());
  const parsed = parseJsonSafe(raw);

  if (parsed.no_stall) return { no_stall: true };

  const errorType = parseErrorType(String(parsed.error_type ?? ""));
  return {
    no_stall:    false,
    error_type:  errorType,
    hint_level_1: String(parsed.hint_level_1 ?? "오류가 감지됐어요. 코드를 다시 확인해 보세요."),
    hint_level_2: String(parsed.hint_level_2 ?? "터미널 메시지나 빨간 줄 표시를 살펴보세요."),
    hint_level_3: String(parsed.hint_level_3 ?? "관련 공식 문서나 에러 메시지를 검색해 보는 것도 좋아요."),
  };
}

async function runProactive(
  model:     ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  imagePart: InlineImagePart,
): Promise<string> {
  const prompt =
    "학생의 화면을 보고 현재 어떤 작업을 하고 있는지 파악하세요 " +
    "(예: AWS EC2 설정, Figma 디자인, VS Code 코딩, 터미널 작업 등). " +
    "파악한 내용을 바탕으로, 학생이 지금 막힐 수 있거나 궁금해할 법한 내용을 " +
    "자연스럽고 친근한 질문 한 문장으로 제안하세요. " +
    "예시: '현재 AWS 콘솔에서 EC2 인스턴스를 설정하시는 것 같은데, 보안 그룹 인바운드 규칙 설정에서 막히는 부분이 있으신가요? 🔍' " +
    "질문 한 문장만 반환하세요. JSON이나 마크다운 없이 순수한 한국어 텍스트로만.";

  const result = await model.generateContent([prompt, imagePart]);
  return result.response.text().trim();
}

async function runManualQA(
  model:      ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  imagePart:  InlineImagePart,
  userPrompt: string,
): Promise<string> {
  const prompt =
    `학생이 다음 질문을 했습니다: '${userPrompt}'\n\n` +
    "화면에 보이는 내용을 맥락으로 활용해 이 질문에 실질적이고 도움이 되는 답변을 제공하세요.";

  const result = await model.generateContent([prompt, imagePart]);
  return result.response.text().trim();
}

// ── Supabase helper ───────────────────────────────────────────────────────────

async function saveStallEvent(
  studentId:  string,
  sessionId:  string,
  errorType:  string,
  aiHint:     string,
): Promise<string> {
  // Count prior stall logs only (not all interactions) to determine escalation
  const { count } = await supabaseAdmin
    .from(LOGS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .not("error_type", "in", '("선제적 조언","질의응답")');

  const priorCount  = count ?? 0;
  const newStatus   = (priorCount + 1) >= CRITICAL_THRESHOLD ? "critical" : "stalled";

  await supabaseAdmin
    .from(SESSIONS_TABLE)
    .update({ status: newStatus })
    .eq("id", sessionId);

  await supabaseAdmin
    .from(LOGS_TABLE)
    .insert({ student_id: studentId, session_id: sessionId, error_type: errorType, ai_hint: aiHint });

  console.log(`[Supabase] Stall logged — student=${studentId}, session=${sessionId}, status=${newStatus}`);
  return newStatus;
}

async function saveInteractionLog(
  studentId: string,
  sessionId: string,
  errorType: string,
  aiHint:    string,
): Promise<void> {
  await supabaseAdmin
    .from(LOGS_TABLE)
    .insert({ student_id: studentId, session_id: sessionId, error_type: errorType, ai_hint: aiHint });

  console.log(`[Supabase] Interaction logged — student=${studentId}, session=${sessionId}, type=${errorType}`);
}

// ── Request body type ─────────────────────────────────────────────────────────

interface AnalyzeBody {
  image_base64: string;
  student_id:   string;
  session_id:   string;
  category:     string;
  request_type?: string;
  user_prompt?:  string;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: AnalyzeBody;
  try {
    body = (await request.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    image_base64,
    student_id,
    session_id,
    category     = "general",
    request_type = "auto",
    user_prompt,
  } = body;

  if (!image_base64 || !student_id || !session_id) {
    return NextResponse.json(
      { error: "image_base64, student_id, and session_id are required." },
      { status: 400 },
    );
  }

  // ── Decode image — strip optional data-URL prefix ─────────────────────────
  const b64 = image_base64.includes(",")
    ? image_base64.split(",")[1]
    : image_base64;

  const imagePart: InlineImagePart = {
    inlineData: { mimeType: "image/jpeg", data: b64 },
  };

  // ── Initialise Gemini models ───────────────────────────────────────────────
  let diagnosticModel: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;
  let chatModel:       ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;
  try {
    ({ diagnosticModel, chatModel } = getModels(category));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gemini initialisation failed." },
      { status: 500 },
    );
  }

  try {
    // ── Manual Q&A ───────────────────────────────────────────────────────────
    if (request_type === "manual") {
      if (!user_prompt?.trim()) {
        return NextResponse.json(
          { error: "user_prompt is required for manual requests." },
          { status: 400 },
        );
      }
      const answer = await runManualQA(chatModel, imagePart, user_prompt.trim());

      try {
        await saveInteractionLog(student_id, session_id, "질의응답", answer);
      } catch (err) {
        console.error("[Supabase] saveInteractionLog (manual) error:", err);
      }

      return NextResponse.json({ success: true, response_type: "answer", message: answer });
    }

    // ── Auto: stall detection ────────────────────────────────────────────────
    const diagnostic = await runDiagnostic(diagnosticModel, imagePart);

    if (!diagnostic.no_stall) {
      // Stall found — persist and return Socratic hints
      const { error_type, hint_level_1, hint_level_2, hint_level_3 } = diagnostic;

      let session_status: string | null = null;
      try {
        session_status = await saveStallEvent(student_id, session_id, error_type, hint_level_1);
      } catch (err) {
        console.error("[Supabase] saveStallEvent error:", err);
      }

      return NextResponse.json({
        success:        true,
        response_type:  "error",
        message:        hint_level_1,
        message_2:      hint_level_2,
        message_3:      hint_level_3,
        error_type,
        session_status,
      });
    }

    // No stall — generate proactive question
    const proactiveMsg = await runProactive(chatModel, imagePart);

    try {
      await saveInteractionLog(student_id, session_id, "선제적 조언", proactiveMsg);
    } catch (err) {
      console.error("[Supabase] saveInteractionLog (proactive) error:", err);
    }

    return NextResponse.json({
      success:       true,
      response_type: "proactive",
      message:       proactiveMsg,
    });

  } catch (err) {
    console.error("[/api/analyze] Gemini error:", err);
    return NextResponse.json(
      { error: `Gemini API error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
