"""
EduLens FastAPI Backend
=======================
Accepts a base64-encoded screenshot from the web client, runs Gemini
Socratic diagnostic analysis, persists the result to Supabase, and
returns the hint to the caller.

Run locally:
    uvicorn api_server:app --reload --port 8000

Run on EC2 / production:
    python api_server.py
    # or: uvicorn api_server:app --host 0.0.0.0 --port 8000
"""

import os
import re
import io
import json
import base64
from enum import Enum

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
CRITICAL_THRESHOLD = 3   # stall count that escalates a session to 'critical'

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
    """Map an arbitrary error_type string from Gemini to the canonical enum."""
    for pattern, etype in _ERROR_TYPE_PATTERNS:
        if pattern.search(raw):
            return etype
    return ErrorType.UNKNOWN


# ── Gemini — system prompt (exact copy from main.py) ──────────────────────────

_SYSTEM_PROMPT = """당신은 Edu-Lens의 정밀 학습 진단 엔진입니다.
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
• problem_location: 오류가 있는 영역의 바운딩 박스.
  각 값은 0~1000 정수 (0=이미지 좌상단, 1000=이미지 우하단).
• hint_level_1 예시: "import 구문을 한번 살펴볼까요? 🔍"
• hint_level_2 예시: "3번째 줄에서 'numpy'를 'numppy'로 오타냈어요. `import numpy as np`로 수정해 보세요!"
• hint_level_3 예시: "Python 패키지 이름은 대소문자를 구분해요. pip show numpy로 설치 여부를 확인해 보세요."

② 학습 정체가 없는 경우 — 아래 JSON만 반환:
{"no_stall": true}

JSON 외의 텍스트, 마크다운 펜스, 설명은 절대 포함하지 마세요."""


def _strip_fences(text: str) -> str:
    """Remove markdown code fences that the model may add despite instructions."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        inner = lines[1:]
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        text = "\n".join(inner).strip()
    return text


def _init_gemini() -> genai.GenerativeModel:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY environment variable is not set.")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=_SYSTEM_PROMPT,
        # Low temperature → high consistency for deterministic diagnostic tasks
        generation_config=genai.GenerationConfig(temperature=0.2),
    )


def _run_gemini(model: genai.GenerativeModel, image: Image.Image) -> dict:
    """
    Send a PIL Image to Gemini and return the parsed diagnostic dict.

    Returns one of:
      {"no_stall": True}
      {"error_type": str, "hint_level_1": str, "hint_level_2": str,
       "hint_level_3": str, ...}
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
        # Fallback: extract the JSON object from surrounding noise
        raw2 = raw.split("{", 1)[-1].rsplit("}", 1)[0]
        result = json.loads("{" + raw2 + "}")

    if result.get("no_stall"):
        return {"no_stall": True}

    # Normalise error_type to canonical enum value
    result["error_type"] = _parse_error_type(
        str(result.get("error_type", ""))
    ).value

    # Guarantee all hint fields exist
    result.setdefault("hint_level_1", "오류가 감지됐어요. 코드를 다시 확인해 보세요.")
    result.setdefault("hint_level_2", "터미널 메시지나 빨간 줄 표시를 살펴보세요.")
    result.setdefault("hint_level_3", "관련 공식 문서나 에러 메시지를 검색해 보는 것도 좋아요.")

    return result


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
    Persist a stall detection to Supabase.

    1. Count existing practice_logs for the session.
    2. Escalate active_sessions.status (active → stalled → critical).
    3. INSERT a new practice_logs row.

    Returns the new session status string.
    """
    # Count prior stall logs for this session
    count_resp = (
        sb.table(LOGS_TABLE)
        .select("id", count="exact")
        .eq("session_id", session_id)
        .execute()
    )
    prior_count: int = count_resp.count or 0

    # Determine and write new session status
    new_status = "critical" if (prior_count + 1) >= CRITICAL_THRESHOLD else "stalled"
    (
        sb.table(SESSIONS_TABLE)
        .update({"status": new_status})
        .eq("id", session_id)
        .execute()
    )

    # Insert immutable log entry
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


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="EduLens API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialise shared singletons once at startup
_model: genai.GenerativeModel = _init_gemini()
_sb:    SupabaseClient         = _init_supabase()


# ── Request / response schemas ─────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    image_base64: str   # raw base64 or data-URL prefix (data:image/png;base64,…)
    student_id:   str
    session_id:   str
    category:     str


class AnalyzeResponse(BaseModel):
    success:    bool
    no_stall:   bool        = False
    error_type: str | None  = None
    ai_hint:    str | None  = None
    ai_hint_2:  str | None  = None
    ai_hint_3:  str | None  = None
    status:     str | None  = None   # updated active_sessions status


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    """Liveness probe — useful for EC2 / ALB health checks."""
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    """
    Analyse a student screenshot for learning stalls.

    Steps:
      1. Decode base64 image.
      2. Call Gemini with Socratic 3-level hint prompt.
      3. If stall found → escalate session, insert practice_log.
      4. Return result.
    """
    # ── 1. Decode image ───────────────────────────────────────────────────────
    try:
        b64_data = req.image_base64
        # Strip optional "data:image/png;base64," prefix (from canvas.toDataURL)
        if "," in b64_data:
            b64_data = b64_data.split(",", 1)[1]
        image_bytes = base64.b64decode(b64_data)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image_base64: {exc}") from exc

    # ── 2. Run Gemini ─────────────────────────────────────────────────────────
    try:
        result = _run_gemini(_model, image)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {exc}") from exc

    # ── 3. No stall → return early ────────────────────────────────────────────
    if result.get("no_stall"):
        return AnalyzeResponse(success=True, no_stall=True)

    # ── 4. Stall found → persist to Supabase ─────────────────────────────────
    error_type: str = result["error_type"]
    ai_hint:    str = result.get("hint_level_1", "")
    ai_hint_2:  str = result.get("hint_level_2", "")
    ai_hint_3:  str = result.get("hint_level_3", "")

    new_status: str | None = None
    try:
        new_status = _save_stall_event(
            _sb,
            student_id=req.student_id,
            session_id=req.session_id,
            error_type=error_type,
            ai_hint=ai_hint,
        )
    except Exception as exc:
        # DB failure must not block the student from receiving their hint
        print(f"[Supabase] Error saving stall event: {exc}")

    # ── 5. Return ─────────────────────────────────────────────────────────────
    return AnalyzeResponse(
        success=True,
        no_stall=False,
        error_type=error_type,
        ai_hint=ai_hint,
        ai_hint_2=ai_hint_2,
        ai_hint_3=ai_hint_3,
        status=new_status,
    )


# ── Entrypoint (EC2 / direct execution) ───────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",   # bind all interfaces so EC2 is reachable externally
        port=8000,
        reload=False,
    )
