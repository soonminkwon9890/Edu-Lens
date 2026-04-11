"""
EduLens FastAPI Backend — v3 (Proactive AI Copilot)
====================================================
Two analysis modes:
  auto   — 30-second periodic stall detection.  Returns either an
            "error" (Socratic hint) or a "proactive" question inferred
            from what the student is currently doing.
  manual — Student asked a question.  Answer it using the screen as
            context and return an "answer".

Run locally:
    uvicorn api_server:app --reload --port 8000

Run on EC2 / production:
    python api_server.py
"""

import os
import re
import io
import json
import base64
from enum import Enum
from typing import Optional

import uvicorn
from dotenv import load_dotenv

load_dotenv()

import google.generativeai as genai
from PIL import Image
from supabase import create_client, Client as SupabaseClient

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Constants ──────────────────────────────────────────────────────────────────

SESSIONS_TABLE     = "active_sessions"
LOGS_TABLE         = "practice_logs"
CRITICAL_THRESHOLD = 3

# ── Error type classification ──────────────────────────────────────────────────

class ErrorType(str, Enum):
    SYNTAX     = "syntax"
    TOOL_USAGE = "tool_usage"
    CONFIG     = "config"
    UNKNOWN    = "unknown"


_ERROR_TYPE_PATTERNS: list[tuple[re.Pattern, ErrorType]] = [
    (re.compile(r"syntax|parse|indent|typo|misspell|bracket|parenthes", re.I), ErrorType.SYNTAX),
    (re.compile(r"tool|usage|api|import|call|method|function|library",  re.I), ErrorType.TOOL_USAGE),
    (re.compile(r"config|setting|env|variable|permission|path|install",  re.I), ErrorType.CONFIG),
]


def _parse_error_type(raw: str) -> ErrorType:
    for pattern, etype in _ERROR_TYPE_PATTERNS:
        if pattern.search(raw):
            return etype
    return ErrorType.UNKNOWN


# ── Model 1 — Diagnostic (stall detection) ────────────────────────────────────
# Preserved verbatim from main.py.  Low temperature for deterministic output.

_DIAGNOSTIC_SYSTEM_PROMPT = """당신은 Edu-Lens의 정밀 학습 진단 엔진입니다.
프로그래밍을 배우는 한국 학생의 스크린샷을 분석하여, 진행을 가로막는 \
'학습 정체(Stall)' 지점을 찾아내는 것이 목표입니다.

══ 진단 루브릭 (이 순서대로 확인하세요) ══

[시각적 단서 — 최우선 탐색 대상]
• 빨간 물결 밑줄 (구문 오류 표시)
• 터미널/콘솔의 빨간 텍스트 또는 오류 메시지
• "Error", "Exception", "Traceback", "Failed", "FAILED",
  "404", "403", "500", "undefined", "null", "NullPointer",
  "ModuleNotFoundError", "SyntaxError", "TypeError" 등의 키워드
• 노란/주황 경고 아이콘 또는 밑줄
• 회색으로 비활성화된 버튼이나 클릭 불가 요소

[컨텍스트별 탐색 전략]
• 터미널/콘솔이 활성화된 경우 → 화면 하단 5~10줄에 집중 (가장 최근 오류)
• 코드 에디터가 활성화된 경우 → 구문 강조 색상 이상, 빨간 밑줄, 들여쓰기 오류
• 브라우저가 활성화된 경우 → HTTP 오류 코드, DevTools 콘솔 오류
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
  "hint_level_2": "<구체적 원인 + 해결 방법. 학생 눈높이의 한국어>",
  "hint_level_3": "<더 깊은 개념 설명 또는 다음 단계 안내. 심화 학습 유도>"
}

② 학습 정체가 없는 경우 — 아래 JSON만 반환:
{"no_stall": true}

JSON 외의 텍스트, 마크다운 펜스, 설명은 절대 포함하지 마세요."""


# ── Model 2 — Chat Copilot (proactive + manual Q&A) ───────────────────────────
# Higher temperature for natural, conversational Korean responses.

_CHAT_SYSTEM_PROMPT = """당신은 EduLens AI 코파일럿입니다.
프로그래밍과 개발을 배우는 한국 학생 옆에서 함께하는 친절하고 유능한 조수입니다.
학생의 화면을 보면서 상황에 맞는 맞춤형 도움을 제공하세요.

답변 원칙:
• 항상 따뜻하고 격려하는 한국어로 답변하세요.
• 학생이 스스로 생각하고 해결할 수 있도록 소크라테스식으로 유도하세요.
• 직접적인 정답보다는 방향과 힌트를 제시하세요.
• 답변은 3~5문장으로 간결하게 유지하세요.
• 마크다운 기호(*, **, #, `, •)는 사용하지 마세요. 순수 텍스트로만 작성하세요."""


def _strip_fences(text: str) -> str:
    """Remove markdown code fences the model may add despite instructions."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        inner = lines[1:]
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        text = "\n".join(inner).strip()
    return text


def _init_diagnostic_model() -> genai.GenerativeModel:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY environment variable is not set.")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=_DIAGNOSTIC_SYSTEM_PROMPT,
        generation_config=genai.GenerationConfig(temperature=0.2),
    )


def _init_chat_model() -> genai.GenerativeModel:
    # genai.configure already called by _init_diagnostic_model
    return genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=_CHAT_SYSTEM_PROMPT,
        generation_config=genai.GenerationConfig(temperature=0.7),
    )


# ── Gemini call helpers ────────────────────────────────────────────────────────

def _run_diagnostic(model: genai.GenerativeModel, image: Image.Image) -> dict:
    """
    Run the stall-detection diagnostic.

    Returns one of:
      {"no_stall": True}
      {"error_type": str, "hint_level_1": str, "hint_level_2": str, "hint_level_3": str}
    """
    prompt = (
        "이 이미지는 학생의 화면 캡처입니다. "
        "일반적인 deprecation warning은 무시하고, "
        "실제 실행을 막는 오류나 문제에만 집중하세요. "
        "학습 정체 지점을 찾아 진단 JSON을 반환하세요. "
        '문제가 없으면 {"no_stall": true}를 반환하세요.'
    )
    response = model.generate_content([prompt, image])
    raw = _strip_fences(response.text)

    try:
        result: dict = json.loads(raw)
    except json.JSONDecodeError:
        raw2 = raw.split("{", 1)[-1].rsplit("}", 1)[0]
        result = json.loads("{" + raw2 + "}")

    if result.get("no_stall"):
        return {"no_stall": True}

    result["error_type"] = _parse_error_type(str(result.get("error_type", ""))).value
    result.setdefault("hint_level_1", "오류가 감지됐어요. 코드를 다시 확인해 보세요.")
    result.setdefault("hint_level_2", "터미널 메시지나 빨간 줄 표시를 살펴보세요.")
    result.setdefault("hint_level_3", "관련 공식 문서나 에러 메시지를 검색해 보는 것도 좋아요.")
    return result


def _run_proactive(model: genai.GenerativeModel, image: Image.Image) -> str:
    """
    Infer what the student is currently doing and return ONE proactive
    question as a plain-text Korean string.
    """
    prompt = (
        "학생의 화면을 보고 현재 어떤 작업을 하고 있는지 파악하세요 "
        "(예: AWS EC2 설정, Figma 디자인, VS Code 코딩, 터미널 작업 등). "
        "파악한 내용을 바탕으로, 학생이 지금 막힐 수 있거나 궁금해할 법한 내용을 "
        "자연스럽고 친근한 질문 한 문장으로 제안하세요. "
        "예시: '현재 AWS 콘솔에서 EC2 인스턴스를 설정하시는 것 같은데, "
        "보안 그룹 인바운드 규칙 설정에서 막히는 부분이 있으신가요? 🔍' "
        "질문 한 문장만 반환하세요. JSON이나 마크다운 없이 순수한 한국어 텍스트로만."
    )
    response = model.generate_content([prompt, image])
    return response.text.strip()


def _run_manual_qa(
    model:       genai.GenerativeModel,
    image:       Image.Image,
    user_prompt: str,
) -> str:
    """
    Answer the student's explicit question using the screen as context.
    Returns a plain-text Korean string.
    """
    prompt = (
        f"학생이 다음 질문을 했습니다: '{user_prompt}'\n\n"
        "화면에 보이는 내용을 맥락으로 활용해 이 질문에 실질적이고 "
        "도움이 되는 답변을 제공하세요."
    )
    response = model.generate_content([prompt, image])
    return response.text.strip()


# ── Supabase ───────────────────────────────────────────────────────────────────

def _init_supabase() -> SupabaseClient:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise EnvironmentError(
            "SUPABASE_URL and SUPABASE_KEY environment variables must be set."
        )
    return create_client(url, key)


def _save_stall_event(
    sb:         SupabaseClient,
    student_id: str,
    session_id: str,
    error_type: str,
    ai_hint:    str,
) -> str:
    """
    Persist a stall event and escalate session status.
    Returns the new status string.
    """
    count_resp = (
        sb.table(LOGS_TABLE)
        .select("id", count="exact")
        .eq("session_id", session_id)
        .execute()
    )
    prior_count: int = count_resp.count or 0

    new_status = "critical" if (prior_count + 1) >= CRITICAL_THRESHOLD else "stalled"
    sb.table(SESSIONS_TABLE).update({"status": new_status}).eq("id", session_id).execute()

    sb.table(LOGS_TABLE).insert({
        "student_id": student_id,
        "session_id": session_id,
        "error_type": error_type,
        "ai_hint":    ai_hint,
    }).execute()

    print(
        f"[Supabase] Stall logged — "
        f"student={student_id!r}, session={session_id!r}, status={new_status}"
    )
    return new_status


# ── Image decoding helper ──────────────────────────────────────────────────────

def _decode_image(b64_string: str) -> Image.Image:
    """Decode a raw or data-URL base64 string into a PIL Image."""
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(b64_string))).convert("RGB")


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="EduLens API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared singletons — initialised once at startup
_diagnostic_model: genai.GenerativeModel = _init_diagnostic_model()
_chat_model:       genai.GenerativeModel = _init_chat_model()
_sb:               SupabaseClient        = _init_supabase()


# ── Schemas ────────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    image_base64: str
    student_id:   str
    session_id:   str
    category:     str
    request_type: str           = "auto"   # "auto" | "manual"
    user_prompt:  Optional[str] = None     # required when request_type == "manual"


class AnalyzeResponse(BaseModel):
    success:        bool
    response_type:  str              # "error" | "proactive" | "answer"
    message:        str              # primary text / hint level 1
    message_2:      Optional[str] = None   # hint level 2  (error only)
    message_3:      Optional[str] = None   # hint level 3  (error only)
    error_type:     Optional[str] = None   # canonical error type (error only)
    session_status: Optional[str] = None   # updated DB status   (error only)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    """
    Unified analysis endpoint.

    request_type == "auto":
      1. Run stall detection (diagnostic model).
      2a. Stall found   → log to Supabase, return response_type="error".
      2b. No stall      → run proactive inference (chat model),
                          return response_type="proactive".

    request_type == "manual":
      1. Answer the user_prompt using the screen as context (chat model).
      2. Return response_type="answer".
    """
    # ── Decode image (shared by all paths) ────────────────────────────────────
    try:
        image = _decode_image(req.image_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image_base64: {exc}") from exc

    # ── Manual Q&A ────────────────────────────────────────────────────────────
    if req.request_type == "manual":
        if not req.user_prompt or not req.user_prompt.strip():
            raise HTTPException(status_code=400, detail="user_prompt is required for manual requests.")
        try:
            answer = _run_manual_qa(_chat_model, image, req.user_prompt.strip())
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Gemini API error: {exc}") from exc

        return AnalyzeResponse(success=True, response_type="answer", message=answer)

    # ── Auto: stall detection ─────────────────────────────────────────────────
    try:
        diagnostic = _run_diagnostic(_diagnostic_model, image)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {exc}") from exc

    if not diagnostic.get("no_stall"):
        # ── Stall found → Socratic hint ───────────────────────────────────────
        error_type = diagnostic["error_type"]
        message    = diagnostic.get("hint_level_1", "")
        message_2  = diagnostic.get("hint_level_2", "")
        message_3  = diagnostic.get("hint_level_3", "")

        session_status: Optional[str] = None
        try:
            session_status = _save_stall_event(
                _sb,
                student_id=req.student_id,
                session_id=req.session_id,
                error_type=error_type,
                ai_hint=message,
            )
        except Exception as exc:
            print(f"[Supabase] Error saving stall event: {exc}")

        return AnalyzeResponse(
            success=True,
            response_type="error",
            message=message,
            message_2=message_2,
            message_3=message_3,
            error_type=error_type,
            session_status=session_status,
        )

    else:
        # ── No stall → proactive question ─────────────────────────────────────
        try:
            proactive_msg = _run_proactive(_chat_model, image)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Gemini API error: {exc}") from exc

        return AnalyzeResponse(
            success=True,
            response_type="proactive",
            message=proactive_msg,
        )


# ── Entrypoint ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )
