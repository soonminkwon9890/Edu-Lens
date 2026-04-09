import sys
import os
import json
import re
import math
import random
import threading
import uuid
import datetime
from dataclasses import dataclass
from enum import Enum
from dotenv import load_dotenv

load_dotenv()

if sys.platform != "darwin":
    import pyautogui
import google.generativeai as genai
from PIL import Image
from supabase import create_client, Client as SupabaseClient
from PyQt6.QtWidgets import (
    QApplication, QLabel, QWidget, QPushButton, QVBoxLayout, QHBoxLayout,
    QGraphicsOpacityEffect, QSizePolicy, QLineEdit,
)
from PyQt6.QtCore import (
    Qt, QPoint, QTimer, QPropertyAnimation, QEasingCurve, pyqtSignal, QObject,
    QRect, QRectF,
)
from PyQt6.QtGui import QPainter, QColor, QPen, QFont, QBrush, QRadialGradient

# ---------------------------------------------------------------------------
# Gemini backend
# ---------------------------------------------------------------------------

class ErrorType(str, Enum):
    SYNTAX    = "syntax"
    TOOL_USAGE = "tool_usage"
    CONFIG    = "config"
    UNKNOWN   = "unknown"


# Korean display labels for the UI badge in GuideOverlay / SocraticHintPanel
ERROR_TYPE_DISPLAY: dict[str, str] = {
    "SYNTAX":     "구문 오류",
    "TOOL_USAGE": "도구 사용법",
    "CONFIG":     "설정 오류",
    "UNKNOWN":    "알 수 없음",
}


# Keyword clusters used to normalise free-text error_type from the model
_ERROR_TYPE_PATTERNS: list[tuple[re.Pattern, ErrorType]] = [
    (re.compile(r"syntax|parse|indent|typo|misspell|bracket|parenthes", re.I), ErrorType.SYNTAX),
    (re.compile(r"tool|usage|api|import|call|method|function|library",  re.I), ErrorType.TOOL_USAGE),
    (re.compile(r"config|setting|env|variable|permission|path|install",  re.I), ErrorType.CONFIG),
]

GEMINI_COORD_SCALE = 1000  # Gemini bounding-box scale

SYSTEM_PROMPT = """당신은 Edu-Lens의 정밀 학습 진단 엔진입니다.
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
  "hint_level_2": "<구체적 원인 + 해결 방법. 학생 눈높이의 한국어>"
}
• problem_location: 오류가 있는 영역의 바운딩 박스.
  각 값은 0~1000 정수 (0=이미지 좌상단, 1000=이미지 우하단).
  오류가 한 줄이라면 해당 줄을 정확히 감싸는 좁은 박스를 사용하세요.
• hint_level_1 예시: "import 구문을 한번 살펴볼까요? 🔍"
• hint_level_2 예시: "3번째 줄에서 'numpy'를 'numppy'로 오타냈어요.
  `import numpy as np`로 수정하면 바로 실행될 거예요!"

② 학습 정체가 없는 경우 — 아래 JSON만 반환:
{"no_stall": true}

JSON 외의 텍스트, 마크다운 펜스, 설명은 절대 포함하지 마세요."""


def init_gemini() -> genai.GenerativeModel:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY environment variable is not set.")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=SYSTEM_PROMPT,
        # Low temperature = high consistency for deterministic diagnostic tasks.
        generation_config=genai.GenerationConfig(temperature=0.2),
    )


def _strip_fences(text: str) -> str:
    """Remove markdown code fences that the model may add despite instructions."""
    text = text.strip()
    if text.startswith("```"):
        # Drop the opening fence line and closing fence
        lines = text.splitlines()
        # First line is ```json or ``` — skip it; last line is ``` — skip it
        inner = lines[1:] if lines[-1].strip() == "```" else lines[1:]
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        text = "\n".join(inner).strip()
    return text


def parse_error_type(raw: str) -> ErrorType:
    """Map an arbitrary error_type string from Gemini to the canonical ErrorType."""
    for pattern, etype in _ERROR_TYPE_PATTERNS:
        if pattern.search(raw):
            return etype
    return ErrorType.UNKNOWN


def map_gemini_coords_to_screen(
    coords: list[int | float],
    screen: QRect,
) -> QRect:
    """
    Convert Gemini's [ymin, xmin, ymax, xmax] (0–1000 scale) to *logical*
    screen pixel coordinates relative to the given window QRect.

    Retina / HiDPI note: the image sent to Gemini is captured at physical
    pixel resolution (e.g. 2× on Retina), but Gemini normalises its bounding
    box to 0–1000 relative to the image dimensions.  When we map back here we
    use the *logical* window dimensions, and the 2× scale cancels out:
        Gemini coord → 0-1000 fraction of pixel image
        Multiply by logical window size → correct logical screen position
    No extra Retina compensation is needed.

    Args:
        coords:  [ymin, xmin, ymax, xmax] each in 0–1000.
        screen:  Logical-coordinate QRect of the captured window.

    Returns:
        QRect with absolute logical pixel position and dimensions.
    """
    ymin, xmin, ymax, xmax = (max(0, min(1000, float(v))) for v in coords)

    sw, sh = screen.width(), screen.height()
    ox, oy = screen.x(),     screen.y()

    px_x1 = ox + int(xmin / GEMINI_COORD_SCALE * sw)
    px_y1 = oy + int(ymin / GEMINI_COORD_SCALE * sh)
    px_x2 = ox + int(xmax / GEMINI_COORD_SCALE * sw)
    px_y2 = oy + int(ymax / GEMINI_COORD_SCALE * sh)

    return QRect(px_x1, px_y1, px_x2 - px_x1, px_y2 - px_y1)


# ---------------------------------------------------------------------------
# Active-window capture (macOS via Quartz + AppKit, Windows via pyautogui)
# ---------------------------------------------------------------------------

# Apps that count as valid "workspace tools" — case-insensitive substring match
RECOGNIZED_TOOLS: frozenset[str] = frozenset({
    "code",           # VS Code / VS Code Insiders
    "cursor",         # Cursor editor
    "figma",          # Figma
    "pycharm",        # PyCharm
    "intellij",       # IntelliJ IDEA
    "webstorm",       # WebStorm
    "phpstorm",       # PhpStorm
    "clion",          # CLion
    "rider",          # Rider
    "xcode",          # Xcode
    "sublime text",   # Sublime Text
    "atom",           # Atom
    "vim",            # Vim (terminal)
    "nvim",           # Neovim
    "emacs",          # Emacs
    "terminal",       # macOS Terminal
    "iterm2",         # iTerm2
    "warp",           # Warp
    "android studio", # Android Studio
    "eclipse",        # Eclipse
    "jupyter",        # JupyterLab / Notebook
    "spyder",         # Spyder IDE
    "rstudio",        # RStudio
    "postman",        # Postman
    "insomnia",       # Insomnia
    "datagrip",       # DataGrip
    "tableplus",      # TablePlus
    "dbeaver",        # DBeaver
    "zed",            # Zed editor
})


class WorkspaceNotFocusedError(Exception):
    """Raised when the frontmost app is not a recognised development tool."""
    def __init__(self, app_name: str) -> None:
        self.app_name = app_name
        super().__init__(f"'{app_name}' is not a recognised workspace tool.")


@dataclass
class WindowCapture:
    """Result of a window-scoped screen capture."""
    image:  Image.Image   # cropped to the active window (Retina-adjusted)
    x:      int           # window left edge, logical screen pixels
    y:      int           # window top edge,  logical screen pixels
    width:  int           # logical width
    height: int           # logical height


def _frontmost_window_bounds_macos() -> tuple[str, int, int, int, int] | None:
    """
    Use Quartz + AppKit to find the largest on-screen window owned by the
    frontmost application.

    Returns (app_name, x, y, width, height) in logical screen coords
    (top-left origin), or None if the information cannot be obtained.
    """
    try:
        import Quartz
        from AppKit import NSWorkspace
        print("[Debug] Quartz and AppKit imported successfully.")
    except ImportError as e:
        print(f"[Debug] Failed to import Quartz/AppKit: {e}")
        return None

    active_app = NSWorkspace.sharedWorkspace().frontmostApplication()
    app_name   = str(active_app.localizedName() or "")
    pid        = active_app.processIdentifier()
    print(f"[Debug] Frontmost app: '{app_name}' (pid={pid})")

    win_list = Quartz.CGWindowListCopyWindowInfo(
        Quartz.kCGWindowListOptionOnScreenOnly
        | Quartz.kCGWindowListExcludeDesktopElements,
        Quartz.kCGNullWindowID,
    )

    if not win_list:
        print("[Debug] Window list is empty. This is a clear Screen Recording permission issue.")
        return None

    best: tuple[int, int, int, int, int] | None = None   # (area, x, y, w, h)
    for win in win_list:
        if win.get("kCGWindowOwnerPID") != pid:
            continue
        bounds = win.get("kCGWindowBounds", {})
        w = int(bounds.get("Width",  0))
        h = int(bounds.get("Height", 0))
        if w < 120 or h < 120:        # skip tiny helper windows / menu items
            continue
        x = int(bounds.get("X", 0))
        y = int(bounds.get("Y", 0))
        area = w * h
        if best is None or area > best[0]:
            best = (area, x, y, w, h)

    if best is None:
        print(f"[Debug] No suitable window found for pid={pid} ('{app_name}'). Check Screen Recording permissions.")
        return None
    _, x, y, w, h = best
    return app_name, x, y, w, h


def _frontmost_window_bounds_windows() -> tuple[str, int, int, int, int] | None:
    """
    Use pyautogui to get the active window title and bounds on Windows.

    Returns (app_name, x, y, width, height) in logical screen coords,
    or None if the information cannot be obtained.
    """
    try:
        win = pyautogui.getActiveWindow()
        if win is None:
            return None
        return (win.title or "", win.left, win.top, win.width, win.height)
    except Exception:
        return None


def get_active_window_info() -> tuple[str, int, int, int, int] | None:
    """
    Return (app_name, x, y, width, height) for the frontmost window.

    Dispatches to the platform-specific implementation:
      - macOS  : Quartz + AppKit (no pyautogui required)
      - Windows: pyautogui.getActiveWindow()

    Returns None if the information cannot be determined on either platform.
    """
    if sys.platform == "darwin":
        return _frontmost_window_bounds_macos()
    else:
        return _frontmost_window_bounds_windows()


def get_active_window_capture() -> WindowCapture:
    """
    Identify the frontmost application window, validate that it is a
    recognised workspace tool, then return a WindowCapture containing a
    screenshot cropped to that window.

    If window bounds cannot be determined, falls back to a full-screen capture
    and skips the workspace-tool check so analysis can still proceed.

    Raises:
        WorkspaceNotFocusedError  – frontmost app is not a workspace tool
                                    (only raised when a specific window IS found).
    """
    info = get_active_window_info()
    full_screen_fallback = False

    if info is None:
        print(
            "[Warning] Could not read the active window bounds "
            "(Screen Recording permission may be missing). "
            "Falling back to full-screen capture."
        )
        full_screen_fallback = True
        app_name = "Full Screen"
    else:
        app_name, x, y, w, h = info
        lower = app_name.lower()
        if not any(tool in lower for tool in RECOGNIZED_TOOLS):
            raise WorkspaceNotFocusedError(app_name)

    # Capture full screen then crop — avoids extra permission dialogs
    if sys.platform == "darwin":
        # PIL.ImageGrab works on macOS without requiring pyautogui
        from PIL import ImageGrab
        full: Image.Image = ImageGrab.grab()
        # Get logical (point) screen size via Quartz so Retina scale is correct
        try:
            import Quartz as _Q
            _disp = _Q.CGMainDisplayID()
            _bounds = _Q.CGDisplayBounds(_disp)
            logical_w = int(_bounds.size.width)
            logical_h = int(_bounds.size.height)
        except Exception:
            # Fallback: assume no HiDPI scaling
            logical_w, logical_h = full.width, full.height
    else:
        full = pyautogui.screenshot()
        logical_w, logical_h = pyautogui.size()

    if full_screen_fallback:
        # Use the entire screen; report logical coords so callers get valid values
        return WindowCapture(image=full, x=0, y=0, width=logical_w, height=logical_h)

    # HiDPI / Retina: PIL pixel size may exceed logical (point) resolution
    scale_x = full.width  / logical_w
    scale_y = full.height / logical_h

    px_x = int(x * scale_x)
    px_y = int(y * scale_y)
    px_w = int(w * scale_x)
    px_h = int(h * scale_y)

    # Clamp to image bounds
    px_x = max(0, min(px_x, full.width  - 1))
    px_y = max(0, min(px_y, full.height - 1))
    px_w = min(px_w, full.width  - px_x)
    px_h = min(px_h, full.height - px_y)

    cropped = full.crop((px_x, px_y, px_x + px_w, px_y + px_h))
    return WindowCapture(image=cropped, x=x, y=y, width=w, height=h)


def capture_and_analyze(
    model: genai.GenerativeModel,
    user_query: str = "",
) -> dict:
    """
    Capture the active workspace window, send it to Gemini, and return a
    parsed diagnostic dict.

    Args:
        model:      Initialised GenerativeModel instance.
        user_query: Optional free-text question from the student.  When
                    non-empty the model prioritises content relevant to the
                    query over generic stall detection.

    Keys on a stall result:
        error_type       – ErrorType enum value (str)
        problem_location – [ymin, xmin, ymax, xmax] in 0-1000 scale,
                           relative to the CROPPED window image
        hint_level_1     – short one-sentence direction (Korean)
        hint_level_2     – detailed explanation and fix (Korean)
        _window_rect     – (x, y, w, h) logical coords of captured window
                           (private key consumed by the UI layer)

    Keys on a no-stall result:
        no_stall         – True  (all other keys absent)
    """
    capture = get_active_window_capture()
    # Save at full resolution — PNG is lossless, no quality loss.
    capture.image.save("current_screen.png", format="PNG")

    # Build a context hint so Gemini knows how the image was captured.
    is_full_screen = (capture.x == 0 and capture.y == 0
                      and capture.width > 1200)
    context_hint = (
        "이 이미지는 전체 화면 캡처입니다. 화면에서 보이는 개발 도구 영역에만 집중하세요."
        if is_full_screen else
        "이 이미지는 활성 창을 잘라낸 것입니다. 창 전체 영역을 분석하세요."
    )

    # If the student typed a specific question, add it as the top priority.
    # The model is also told to ignore generic deprecation warnings unless
    # they are directly relevant to the student's question.
    if user_query:
        query_hint = (
            f"사용자가 다음 질문을 남겼습니다: '{user_query}'. "
            "터미널의 단순 경고(deprecation warning 등)보다 사용자의 질문과 "
            "관련된 코드 로직이나 에러를 최우선으로 분석하세요."
        )
    else:
        query_hint = (
            "일반적인 deprecation warning은 오류가 아니므로 무시하고, "
            "실제 실행을 막는 오류나 문제에 집중하세요."
        )

    prompt = (
        f"{context_hint} "
        f"{query_hint} "
        "학습 정체 지점을 찾아 진단 JSON을 반환하세요. "
        "문제가 없으면 {\"no_stall\": true}를 반환하세요."
    )

    response = model.generate_content([prompt, capture.image])
    raw = _strip_fences(response.text)

    try:
        result: dict = json.loads(raw)
    except json.JSONDecodeError:
        # If the model wrapped in fences despite instructions, strip again
        # more aggressively and retry once.
        raw2 = raw.split("{", 1)[-1].rsplit("}", 1)[0]
        result = json.loads("{" + raw2 + "}")

    # ── No-stall fast path ──────────────────────────────────────────────────
    if result.get("no_stall"):
        print("[분석] 학습 정체 없음 — 문제가 발견되지 않았습니다.")
        return {"no_stall": True}

    # ── Stall found — normalise fields ─────────────────────────────────────
    result["error_type"] = parse_error_type(
        str(result.get("error_type", ""))
    ).value

    loc = result.get("problem_location")
    if isinstance(loc, list) and len(loc) == 4:
        result["problem_location"] = [max(0, min(1000, int(v))) for v in loc]
    else:
        # Gemini omitted or mangled the bounding box — use a full-frame box
        # so the overlay at least appears somewhere rather than crashing.
        print(f"[경고] problem_location 형식 오류: {loc!r} — 전체 화면 박스 사용")
        result["problem_location"] = [50, 50, 950, 950]

    # Ensure hint fields exist
    result.setdefault("hint_level_1", "오류가 감지됐어요. 코드를 다시 확인해 보세요.")
    result.setdefault("hint_level_2", "자세한 내용을 확인하려면 터미널 메시지나 빨간 줄 표시를 살펴보세요.")

    # Pass the window geometry to the UI so the overlay lands on the right spot
    result["_window_rect"] = (capture.x, capture.y, capture.width, capture.height)

    return result


# ---------------------------------------------------------------------------
# Supabase backend
# ---------------------------------------------------------------------------

STORAGE_BUCKET = "student-snapshots"
LOGS_TABLE = "practice_logs"
CRITICAL_THRESHOLD = 3  # triggers per context before status → 'critical'


def init_supabase() -> SupabaseClient:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise EnvironmentError(
            "SUPABASE_URL and SUPABASE_KEY environment variables must be set."
        )
    return create_client(url, key)


def _upload_screenshot(sb: SupabaseClient, local_path: str, student_id: str) -> str:
    """Upload screenshot to Storage and return its public URL."""
    timestamp = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    remote_path = f"{student_id}/{timestamp}_{uuid.uuid4().hex[:8]}.png"

    with open(local_path, "rb") as f:
        sb.storage.from_(STORAGE_BUCKET).upload(
            path=remote_path,
            file=f,
            file_options={"content-type": "image/png"},
        )

    public_url: str = sb.storage.from_(STORAGE_BUCKET).get_public_url(remote_path)
    return public_url


def _count_recent_stalls(sb: SupabaseClient, student_id: str, tool_name: str) -> int:
    """
    Count how many stall events exist for this (student_id, tool_name) pair,
    regardless of their current status.  Used to decide if the *new* record
    should be marked 'critical'.
    """
    response = (
        sb.table(LOGS_TABLE)
        .select("id", count="exact")
        .eq("student_id", student_id)
        .eq("tool_name", tool_name)
        .in_("status", ["stalled", "critical"])
        .execute()
    )
    return response.count or 0


def save_stall_event(
    sb: SupabaseClient,
    student_id: str,
    tool_name: str,
    ai_hint: str,
    screenshot_path: str,
) -> dict:
    """
    Upload the screenshot, determine the appropriate status, and insert a
    record into `practice_logs`.  Returns the inserted row dict.
    """
    screenshot_url = _upload_screenshot(sb, screenshot_path, student_id)

    prior_count = _count_recent_stalls(sb, student_id, tool_name)
    # The new record will be the (prior_count + 1)-th trigger.
    status = "critical" if (prior_count + 1) >= CRITICAL_THRESHOLD else "stalled"

    row = {
        "student_id": student_id,
        "tool_name": tool_name,
        "ai_hint": ai_hint,
        "screenshot_url": screenshot_url,
        "status": status,
    }

    result = sb.table(LOGS_TABLE).insert(row).execute()
    inserted = result.data[0] if result.data else row
    print(
        f"[Supabase] Logged event — student={student_id}, "
        f"tool={tool_name}, status={status}"
    )
    return inserted


def save_resolve_event(
    sb: SupabaseClient,
    student_id: str,
    tool_name: str,
) -> None:
    """Insert a 'resolved' log row to signal the student fixed the stall."""
    row = {
        "student_id": student_id,
        "tool_name": tool_name,
        "ai_hint": "",
        "screenshot_url": "",
        "status": "resolved",
    }
    sb.table(LOGS_TABLE).insert(row).execute()
    print(f"[Supabase] Resolved — student={student_id}, tool={tool_name}")


# ---------------------------------------------------------------------------
# Signal bridge (thread → main thread)
# ---------------------------------------------------------------------------

class AnalysisBridge(QObject):
    finished       = pyqtSignal(dict)
    error          = pyqtSignal(str)
    critical_alert = pyqtSignal(str)   # emitted when status == 'critical'
    resolve_done   = pyqtSignal()       # emitted after save_resolve_event succeeds


# ---------------------------------------------------------------------------
# GuideOverlay — pulsing highlight drawn over the Gemini problem area
# ---------------------------------------------------------------------------

_OVERLAY_CLOSE_BTN_STYLE = """
    QPushButton {
        background-color: rgba(200, 30, 30, 220);
        color: white;
        border: 1px solid rgba(255, 120, 120, 180);
        border-radius: 11px;
        padding: 5px 14px;
        font-size: 12px;
        font-weight: bold;
    }
    QPushButton:hover  { background-color: rgba(230, 60, 60, 240); }
    QPushButton:pressed{ background-color: rgba(160, 20, 20, 240); }
"""

_COUNTDOWN_STYLE = (
    "color: rgba(255, 190, 190, 200);"
    "font-size: 11px;"
    "background: transparent;"
    "padding: 0;"
)


class _OverlayControls(QWidget):
    """
    Small floating widget (close button + countdown) anchored near the
    highlighted rect.  Lives outside the main overlay so it can receive
    mouse events while the overlay stays fully pass-through.
    """

    def __init__(self, rect: QRect, dismiss_cb):
        super().__init__()
        self._dismiss_cb = dismiss_cb
        self._remaining  = GuideOverlay.AUTO_HIDE_S

        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)

        self._close_btn = QPushButton("✕  닫기")
        self._close_btn.setStyleSheet(_OVERLAY_CLOSE_BTN_STYLE)
        self._close_btn.clicked.connect(dismiss_cb)
        layout.addWidget(self._close_btn)

        self._countdown = QLabel(self._fmt())
        self._countdown.setStyleSheet(_COUNTDOWN_STYLE)
        self._countdown.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self._countdown)

        self.adjustSize()
        self._anchor(rect)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)
        self._timer.start(1000)

    def _fmt(self) -> str:
        return f"자동 닫힘: {self._remaining}초 후"

    def _tick(self):
        self._remaining -= 1
        self._countdown.setText(self._fmt())
        if self._remaining <= 0:
            self._timer.stop()

    def _anchor(self, rect: QRect):
        """Position the controls just above the highlighted rect, right-aligned."""
        screen = QApplication.primaryScreen().geometry()
        w, h = self.width(), self.height()
        x = min(rect.right() - w, screen.right() - w - 4)
        x = max(x, screen.left() + 4)
        y = rect.top() - h - 8
        if y < screen.top() + 4:          # not enough room above → go below
            y = rect.bottom() + 8
        self.move(x, y)


class GuideOverlay(QWidget):
    """
    Full-screen transparent pass-through overlay that draws a pulsing red
    rectangle at the Gemini-supplied problem location.

    Lifecycle:
      - Fades in over 400 ms on show.
      - The fill alpha oscillates (pulse) between _ALPHA_MIN and _ALPHA_MAX.
      - Dismissed via the floating close button OR automatically after
        AUTO_HIDE_S seconds, with a 500 ms fade-out.
    """

    AUTO_HIDE_S   = 10
    _PULSE_MS     = 28       # ~36 fps
    _ALPHA_MIN    = 18
    _ALPHA_MAX    = 88
    _ALPHA_STEP   = 2
    _FADE_IN_MS   = 400
    _FADE_OUT_MS  = 500
    _CORNER_SIZE  = 16

    def __init__(self, rect: QRect, error_type: str = ""):
        super().__init__()
        self._rect        = rect
        self._error_type  = error_type.upper() if error_type else ""
        self._alpha       = float(self._ALPHA_MIN)
        self._alpha_dir   = 1           # +1 rising, -1 falling
        self._dismissed   = False

        # ── Window flags ────────────────────────────────────────────────
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.setGeometry(QApplication.primaryScreen().geometry())

        # ── Opacity effect (used for fade-in / fade-out) ─────────────
        self._fx = QGraphicsOpacityEffect(self)
        self._fx.setOpacity(0.0)
        self.setGraphicsEffect(self._fx)

        # ── Fade-in ──────────────────────────────────────────────────
        self._fade_anim = QPropertyAnimation(self._fx, b"opacity", self)
        self._fade_anim.setDuration(self._FADE_IN_MS)
        self._fade_anim.setStartValue(0.0)
        self._fade_anim.setEndValue(1.0)
        self._fade_anim.setEasingCurve(QEasingCurve.Type.OutCubic)

        # ── Pulse timer ──────────────────────────────────────────────
        self._pulse_timer = QTimer(self)
        self._pulse_timer.timeout.connect(self._tick_pulse)

        # ── Auto-dismiss timer ───────────────────────────────────────
        self._auto_timer = QTimer(self)
        self._auto_timer.setSingleShot(True)
        self._auto_timer.timeout.connect(self.dismiss)

        # ── Floating controls (close btn + countdown) ────────────────
        self._controls = _OverlayControls(rect, self.dismiss)

    # ── Public ──────────────────────────────────────────────────────────

    def show(self):
        super().show()
        self._controls.show()
        self._fade_anim.start()
        self._pulse_timer.start(self._PULSE_MS)
        self._auto_timer.start(self.AUTO_HIDE_S * 1000)

    def dismiss(self):
        if self._dismissed:
            return
        self._dismissed = True
        self._pulse_timer.stop()
        self._auto_timer.stop()
        self._controls.close()

        anim = QPropertyAnimation(self._fx, b"opacity", self)
        anim.setDuration(self._FADE_OUT_MS)
        anim.setStartValue(self._fx.opacity())
        anim.setEndValue(0.0)
        anim.setEasingCurve(QEasingCurve.Type.InCubic)
        anim.finished.connect(self.close)
        anim.start(QPropertyAnimation.DeletionPolicy.DeleteWhenStopped)

    # ── Internal ────────────────────────────────────────────────────────

    def _tick_pulse(self):
        self._alpha += self._ALPHA_STEP * self._alpha_dir
        if self._alpha >= self._ALPHA_MAX:
            self._alpha = self._ALPHA_MAX
            self._alpha_dir = -1
        elif self._alpha <= self._ALPHA_MIN:
            self._alpha = self._ALPHA_MIN
            self._alpha_dir = 1
        self.update()

    def paintEvent(self, _event):
        painter = QPainter(self)
        try:
            painter.setRenderHint(QPainter.RenderHint.Antialiasing)

            a     = int(self._alpha)
            r     = self._rect
            rf    = QRectF(r)

            # ── Outer glow (radial gradient halo) ───────────────────────
            glow_a = max(0, a - 10)
            grad = QRadialGradient(rf.center(), max(rf.width(), rf.height()) * 0.7)
            grad.setColorAt(0.55, QColor(255, 60, 60, glow_a))
            grad.setColorAt(1.0,  QColor(255, 60, 60, 0))
            painter.setPen(Qt.PenStyle.NoPen)
            expanded = rf.adjusted(-20, -20, 20, 20)
            painter.setBrush(QBrush(grad))
            painter.drawEllipse(expanded)

            # ── Semi-transparent red fill ────────────────────────────────
            painter.setBrush(QBrush(QColor(255, 45, 45, a)))
            border_a = min(255, a * 3)
            painter.setPen(QPen(QColor(255, 80, 80, border_a), 2))
            painter.drawRoundedRect(rf, 8, 8)

            # ── Animated corner accents ──────────────────────────────────
            accent_a = min(255, border_a + 50)
            painter.setPen(QPen(QColor(255, 210, 210, accent_a), 3))
            cs = self._CORNER_SIZE
            for dx, dy in [
                (0, 0),
                (r.width() - cs, 0),
                (0, r.height() - cs),
                (r.width() - cs, r.height() - cs),
            ]:
                px, py = r.x() + dx, r.y() + dy
                painter.drawLine(px, py, px + cs, py)
                painter.drawLine(px, py, px, py + cs)

            # ── Error-type label inside rect (Korean display name) ───────
            if self._error_type and r.height() > 28:
                display_label = ERROR_TYPE_DISPLAY.get(self._error_type, self._error_type)
                label_rect = QRect(r.x() + 10, r.y() + 7, r.width() - 20, 18)
                f = painter.font()
                f.setPixelSize(11)
                f.setBold(True)
                painter.setFont(f)
                painter.setPen(QPen(QColor(255, 230, 230, min(255, accent_a))))
                painter.drawText(
                    label_rect,
                    Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                    f"⚠  {display_label}",
                )
        finally:
            painter.end()


# ---------------------------------------------------------------------------
# Critical-alert banner
# ---------------------------------------------------------------------------

class CriticalBanner(QWidget):
    """Floating banner shown when a student hits the critical threshold."""

    def __init__(self, student_id: str):
        super().__init__()
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 14, 20, 14)

        msg = QLabel(
            f"⚠️  학습 위기 감지\n"
            f"학생 '{student_id}'이(가) {CRITICAL_THRESHOLD}회 이상 정체 중입니다.\n"
            f"교수자/학습 관리자의 도움이 필요할 수 있습니다."
        )
        msg.setAlignment(Qt.AlignmentFlag.AlignCenter)
        msg.setWordWrap(True)
        msg.setStyleSheet(
            "color: white; font-size: 13px; font-weight: bold; line-height: 1.5;"
        )
        layout.addWidget(msg)

        self.setStyleSheet(
            "background-color: rgba(180, 30, 30, 220);"
            "border-radius: 14px;"
            "border: 2px solid rgba(255, 120, 120, 200);"
        )

        # Position at top-centre of screen
        screen = QApplication.primaryScreen().geometry()
        self.adjustSize()
        self.move(
            screen.x() + (screen.width() - self.sizeHint().width()) // 2,
            screen.y() + 40,
        )

        self._fade_in()
        QTimer.singleShot(7000, self.close)

    def _fade_in(self):
        effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(effect)
        anim = QPropertyAnimation(effect, b"opacity", self)
        anim.setDuration(350)
        anim.setStartValue(0.0)
        anim.setEndValue(1.0)
        anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        anim.start(QPropertyAnimation.DeletionPolicy.DeleteWhenStopped)


# ---------------------------------------------------------------------------
# FocusToast — "please focus on your workspace" notification
# ---------------------------------------------------------------------------

class FocusToast(QWidget):
    """
    Small non-blocking toast that tells the student to switch to a workspace
    tool.  Appears at the bottom-centre of the screen and auto-closes.
    """

    def __init__(self, app_name: str) -> None:
        super().__init__()
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(22, 14, 22, 14)
        layout.setSpacing(4)

        icon_row = QHBoxLayout()
        icon = QLabel("👁")
        icon.setStyleSheet("font-size: 24px; background: transparent;")
        icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_row.addStretch(); icon_row.addWidget(icon); icon_row.addStretch()
        layout.addLayout(icon_row)

        main_msg = QLabel("개발 도구 창(VS Code 등)을 선택해 주세요!")
        main_msg.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_msg.setStyleSheet(
            "color: #ffe8a0; font-size: 13px; font-weight: bold; background: transparent;"
        )
        layout.addWidget(main_msg)

        sub_msg = QLabel(f'"{app_name}"은(는) 분석 대상 도구가 아닙니다.')
        sub_msg.setAlignment(Qt.AlignmentFlag.AlignCenter)
        sub_msg.setStyleSheet(
            "color: rgba(255,230,160,170); font-size: 11px; background: transparent;"
        )
        layout.addWidget(sub_msg)

        hint = QLabel("VS Code, PyCharm, 터미널 등으로 창을 전환하세요.")
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        hint.setStyleSheet(
            "color: rgba(200,200,200,140); font-size: 10px; background: transparent;"
        )
        layout.addWidget(hint)

        self.setStyleSheet(
            "background-color: rgba(60, 45, 10, 225);"
            "border-radius: 16px;"
            "border: 1px solid rgba(255, 200, 60, 120);"
        )
        self.adjustSize()

        screen = QApplication.primaryScreen().geometry()
        self.move(
            screen.x() + (screen.width()  - self.width())  // 2,
            screen.y() +  screen.height() - self.height() - 60,
        )

        # Fade-in
        fx = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(fx)
        anim = QPropertyAnimation(fx, b"opacity", self)
        anim.setDuration(300)
        anim.setStartValue(0.0); anim.setEndValue(1.0)
        anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        anim.start(QPropertyAnimation.DeletionPolicy.DeleteWhenStopped)

        QTimer.singleShot(4500, self.close)


# ---------------------------------------------------------------------------
# CongratsBurst — full-screen particle celebration overlay
# ---------------------------------------------------------------------------

class CongratsBurst(QWidget):
    """Short-lived confetti burst shown when the student marks a stall resolved."""

    _TICK_MS       = 16        # ~60 fps
    _TOTAL_TICKS   = 180       # ~3 s
    _N_PARTICLES   = 52
    _GRAVITY       = 0.22
    _DRAG          = 0.985
    _COLORS = [
        QColor(255, 215,   0),   # gold
        QColor(138,  43, 226),   # purple
        QColor( 50, 205,  50),   # green
        QColor(255, 105, 180),   # pink
        QColor( 30, 144, 255),   # blue
        QColor(255, 140,   0),   # orange
        QColor(220, 220,  50),   # yellow
    ]

    def __init__(self):
        super().__init__()
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        screen = QApplication.primaryScreen().geometry()
        self.setGeometry(screen)

        cx = screen.width()  / 2.0
        cy = screen.height() / 2.0

        self._particles: list[dict] = []
        for _ in range(self._N_PARTICLES):
            angle = random.uniform(0, 2 * math.pi)
            speed = random.uniform(4, 15)
            self._particles.append({
                "x":    cx, "y":    cy,
                "vx":   math.cos(angle) * speed,
                "vy":   math.sin(angle) * speed - random.uniform(2, 6),
                "color": random.choice(self._COLORS),
                "size": random.uniform(7, 17),
                "spin": random.uniform(-0.15, 0.15),
                "angle": random.uniform(0, 2 * math.pi),
            })

        self._tick  = 0
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._step)
        self._timer.start(self._TICK_MS)

    def _step(self):
        self._tick += 1
        for p in self._particles:
            p["x"]     += p["vx"]
            p["y"]     += p["vy"]
            p["vy"]    += self._GRAVITY
            p["vx"]    *= self._DRAG
            p["angle"] += p["spin"]
        self.update()
        if self._tick >= self._TOTAL_TICKS:
            self._timer.stop()
            self.close()

    def paintEvent(self, _event):
        painter = QPainter(self)
        try:
            painter.setRenderHint(QPainter.RenderHint.Antialiasing)
            life = max(0.0, 1.0 - self._tick / self._TOTAL_TICKS)

            for p in self._particles:
                c = QColor(p["color"])
                c.setAlphaF(life)
                painter.setBrush(QBrush(c))
                painter.setPen(Qt.PenStyle.NoPen)

                s = p["size"] * (0.4 + 0.6 * life)
                painter.save()
                painter.translate(p["x"], p["y"])
                painter.rotate(math.degrees(p["angle"]))
                # alternate between circle and small rect for variety
                if p["size"] > 12:
                    painter.drawRect(QRectF(-s / 2, -s / 4, s, s / 2))
                else:
                    painter.drawEllipse(QRectF(-s / 2, -s / 2, s, s))
                painter.restore()
        finally:
            painter.end()


# ---------------------------------------------------------------------------
# Socratic Hint Panel  —  3-stage progressive disclosure
# ---------------------------------------------------------------------------

_PANEL_SS = """
QWidget#panelRoot {
    background-color: rgba(26, 26, 46, 255);
    border-radius: 20px;
    border: 2px solid #4a4a6a;
}
QLabel#headerTitle {
    color: rgba(210, 200, 255, 235);
    font-size: 13px;
    font-weight: bold;
}
QLabel#stageLbl {
    color: rgba(170, 160, 220, 210);
    font-size: 12px;
    line-height: 160%;
}
QLabel#contentLbl {
    color: #e8e4ff;
    font-size: 13px;
    line-height: 160%;
}
QLabel#statusPill {
    font-size: 10px;
    font-weight: bold;
    border-radius: 9px;
    padding: 2px 9px;
}
QPushButton#btnPrimary {
    background-color: rgba(110, 75, 240, 230);
    color: white;
    border: 1px solid rgba(160, 130, 255, 200);
    border-radius: 13px;
    padding: 10px 15px;
    font-size: 13px;
    font-weight: bold;
    min-width: 130px;
}
QPushButton#btnPrimary:hover  { background-color: rgba(140, 105, 255, 245); }
QPushButton#btnPrimary:pressed{ background-color: rgba(80,  55, 190, 245); }
QPushButton#btnResolve {
    background-color: rgba(25, 155, 85, 230);
    color: white;
    border: 1px solid rgba(60, 210, 120, 180);
    border-radius: 13px;
    padding: 10px 15px;
    font-size: 13px;
    font-weight: bold;
    min-width: 130px;
}
QPushButton#btnResolve:hover  { background-color: rgba(40, 185, 105, 245); }
QPushButton#btnResolve:pressed{ background-color: rgba(15, 115,  60, 245); }
QPushButton#btnSkip {
    background-color: rgba(255, 255, 255, 12);
    color: rgba(170, 165, 210, 210);
    border: 1px solid rgba(110, 90, 240, 100);
    border-radius: 13px;
    padding: 10px 15px;
    font-size: 13px;
    min-width: 130px;
}
QPushButton#btnSkip:hover { background-color: rgba(255,255,255,22);
                             color: rgba(210, 205, 255, 240);
                             border-color: rgba(150, 130, 255, 180); }
QPushButton#btnClose {
    background: rgba(255,255,255,18);
    color: rgba(180,175,220,200);
    border: none;
    border-radius: 10px;
    padding: 3px 10px;
    font-size: 12px;
}
QPushButton#btnClose:hover { background: rgba(220,50,50,140); color: white; }
"""

_BUBBLE_SS = """
QWidget#panelRoot {
    background-color: rgba(26, 18, 52, 255);
    border-radius: 20px;
    border: 2px solid rgba(140, 100, 255, 220);
}
"""


class SocraticHintPanel(QWidget):
    """
    Three-stage Socratic hint panel.

    Stage 0 — Speech bubble  : "I found something! Need a hint?"
    Stage 1 — Level-1 hint   : vague direction  + [Tell me more] [✅ Resolved]
    Stage 2 — Level-2 hint   : detailed fix     + [✅ Resolved]

    Emits `resolved` when the student confirms the stall is fixed.
    """

    resolved = pyqtSignal()

    _STAGE_BUBBLE = 0
    _STAGE_HINT1  = 1
    _STAGE_HINT2  = 2

    _FADE_MS      = 180   # body cross-fade duration

    def __init__(self, result: dict, log_status: str = "stalled"):
        super().__init__()
        self._hint1      = result.get("hint_level_1", "힌트를 불러올 수 없습니다.")
        self._hint2      = result.get("hint_level_2", "추가 설명을 불러올 수 없습니다.")
        self._error_type = result.get("error_type", "unknown").upper()
        self._log_status = log_status
        self._stage      = self._STAGE_BUBBLE
        self._drag_pos   = None          # QPoint | None  (delta-based drag)

        self.setObjectName("panelRoot")
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint
        )
        # WA_TranslucentBackground lets the rounded border-radius show through.
        # The stylesheet uses fully-opaque backgrounds so nothing bleeds through.
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAutoFillBackground(True)
        # Fixed width; height is unrestricted — the layout drives it.
        self.setFixedWidth(550)
        self.setStyleSheet(_PANEL_SS + _BUBBLE_SS)

        self._build_skeleton()
        self._render_stage(animate=False)
        self._fade_in()

    # ── Skeleton (static chrome + swappable body) ──────────────────────────

    def _build_skeleton(self):
        self._root_layout = QVBoxLayout(self)
        self._root_layout.setContentsMargins(20, 16, 20, 18)
        self._root_layout.setSpacing(0)
        # SetFixedSize makes Qt resize the window to the layout's size hint
        # whenever content changes — this is what gives us dynamic height.
        self._root_layout.setSizeConstraint(
            QVBoxLayout.SizeConstraint.SetFixedSize
        )

        # ── Header (always visible) ──────────────────────────────────────
        hdr = QHBoxLayout()
        hdr.setSpacing(8)

        self._badge = QLabel(f"  {ERROR_TYPE_DISPLAY.get(self._error_type, self._error_type)}  ")
        self._badge.setObjectName("statusPill")
        self._badge.setStyleSheet(
            "color:white; background:rgba(110,75,240,190);"
            "border-radius:9px; font-size:10px; font-weight:bold; padding:2px 9px;"
        )

        title = QLabel("🤖  Edu-Lens")
        title.setObjectName("headerTitle")

        self._status_pill = QLabel(f"  {self._log_status}  ")
        self._status_pill.setObjectName("statusPill")
        pill_bg = "rgba(200,40,40,170)" if self._log_status == "critical" \
                  else "rgba(60,130,70,170)"
        self._status_pill.setStyleSheet(
            f"color:white; background:{pill_bg};"
            "border-radius:9px; font-size:10px; font-weight:bold; padding:2px 9px;"
        )

        close_btn = QPushButton("✕")
        close_btn.setObjectName("btnClose")
        close_btn.setFixedSize(28, 22)
        close_btn.clicked.connect(self.close)

        hdr.addWidget(title)
        hdr.addWidget(self._badge)
        hdr.addStretch()
        hdr.addWidget(self._status_pill)
        hdr.addWidget(close_btn)
        self._root_layout.addLayout(hdr)

        # thin divider
        div = QLabel(); div.setFixedHeight(1)
        div.setStyleSheet("background:rgba(110,90,240,70); margin-top:8px; margin-bottom:6px;")
        self._root_layout.addWidget(div)

        # ── Body widget (swapped per stage) ─────────────────────────────
        self._body = QWidget()
        self._body_layout = QVBoxLayout(self._body)
        self._body_layout.setContentsMargins(0, 4, 0, 0)
        self._body_layout.setSpacing(10)
        self._root_layout.addWidget(self._body)

        # opacity effect on body for cross-fade
        self._body_fx = QGraphicsOpacityEffect(self._body)
        self._body.setGraphicsEffect(self._body_fx)

    # ── Stage rendering ────────────────────────────────────────────────────

    @staticmethod
    def _clear_layout(layout):
        """Recursively remove and schedule deletion of all items in a layout."""
        while layout.count():
            child = layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()
            elif child.layout():
                SocraticHintPanel._clear_layout(child.layout())

    def _render_stage(self, animate: bool = True):
        def _do_render():
            self._clear_layout(self._body_layout)
            if self._stage == self._STAGE_BUBBLE:
                self._render_bubble()
                self.setStyleSheet(_PANEL_SS + _BUBBLE_SS)
            elif self._stage == self._STAGE_HINT1:
                self._render_hint(level=1)
                self.setStyleSheet(_PANEL_SS)
            else:
                self._render_hint(level=2)
                self.setStyleSheet(_PANEL_SS)
            self.adjustSize()
            self.update()

        if not animate:
            _do_render()
            return

        # Fade body out → rebuild content → fade back in
        out = QPropertyAnimation(self._body_fx, b"opacity", self)
        out.setDuration(self._FADE_MS)
        out.setStartValue(1.0); out.setEndValue(0.0)
        out.setEasingCurve(QEasingCurve.Type.InCubic)

        def _after_out():
            _do_render()
            inn = QPropertyAnimation(self._body_fx, b"opacity", self)
            inn.setDuration(self._FADE_MS)
            inn.setStartValue(0.0); inn.setEndValue(1.0)
            inn.setEasingCurve(QEasingCurve.Type.OutCubic)
            # Pin opacity to exactly 1.0 so residual float rounding can't leave
            # the body semi-transparent after the animation completes.
            inn.finished.connect(lambda: self._body_fx.setOpacity(1.0))
            inn.start(QPropertyAnimation.DeletionPolicy.DeleteWhenStopped)

        out.finished.connect(_after_out)
        out.start(QPropertyAnimation.DeletionPolicy.DeleteWhenStopped)

    def _render_bubble(self):
        bl = self._body_layout

        emoji = QLabel("🔍")
        emoji.setAlignment(Qt.AlignmentFlag.AlignCenter)
        emoji.setStyleSheet("font-size: 36px; background: transparent;")
        bl.addWidget(emoji)

        msg = QLabel("학습 정체 구간을 발견했어요!\n힌트가 필요하신가요?")
        msg.setObjectName("contentLbl")
        msg.setAlignment(Qt.AlignmentFlag.AlignCenter)
        msg.setStyleSheet(
            "color: #d8d0ff; font-size: 15px; font-weight: bold;"
            "background: transparent; line-height: 160%;"
        )
        bl.addWidget(msg)

        bl.addSpacing(8)

        row = QHBoxLayout()
        row.setSpacing(20)
        row.setContentsMargins(10, 10, 10, 10)

        skip_btn = QPushButton("직접 해결해볼게요  ✓")
        skip_btn.setObjectName("btnSkip")
        skip_btn.clicked.connect(self._mark_resolved)

        yes_btn = QPushButton("네, 힌트 부탁드려요  →")
        yes_btn.setObjectName("btnPrimary")
        yes_btn.clicked.connect(self._go_hint1)

        row.addStretch(1)
        row.addWidget(skip_btn)
        row.addWidget(yes_btn)
        bl.addLayout(row)

        self.adjustSize()
        self.update()

    def _render_hint(self, level: int):
        bl = self._body_layout
        hint_text = self._hint1 if level == 1 else self._hint2

        stage_lbl = QLabel(
            f"힌트 {level}/2 — {'방향 제시' if level == 1 else '상세 설명'}"
        )
        stage_lbl.setObjectName("stageLbl")
        bl.addWidget(stage_lbl)

        content = QLabel(hint_text)
        content.setObjectName("contentLbl")
        content.setWordWrap(True)
        content.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        # MinimumExpanding lets the label grow vertically to show all wrapped
        # text rather than being clipped by the layout's default constraints.
        content.setSizePolicy(
            QSizePolicy.Policy.Preferred, QSizePolicy.Policy.MinimumExpanding
        )
        content.setStyleSheet(
            "color: #e8e4ff; font-size: 13px; background: transparent;"
            "line-height: 160%; padding-bottom: 6px;"
        )
        bl.addWidget(content)

        bl.addSpacing(8)

        row = QHBoxLayout()
        row.setSpacing(20)
        row.setContentsMargins(10, 10, 10, 10)
        row.addStretch(1)

        resolve_btn = QPushButton("해결 완료! 🎉")
        resolve_btn.setObjectName("btnResolve")
        resolve_btn.clicked.connect(self._mark_resolved)
        row.addWidget(resolve_btn)

        if level == 1:
            more_btn = QPushButton("더 자세히 알려주세요  →")
            more_btn.setObjectName("btnPrimary")
            more_btn.clicked.connect(self._go_hint2)
            row.addWidget(more_btn)

        bl.addLayout(row)

        self.adjustSize()
        self.update()

    # ── Transitions ────────────────────────────────────────────────────────

    def _go_hint1(self):
        self._stage = self._STAGE_HINT1
        self._render_stage(animate=True)

    def _go_hint2(self):
        self._stage = self._STAGE_HINT2
        self._render_stage(animate=True)

    def _mark_resolved(self):
        self.resolved.emit()
        self.close()

    # ── Helpers ────────────────────────────────────────────────────────────

    def _fade_in(self):
        """Fade the panel in using window-level opacity so no QGraphicsOpacityEffect
        is left on the widget after the animation, preventing residual transparency."""
        self.setWindowOpacity(0.0)
        anim = QPropertyAnimation(self, b"windowOpacity", self)
        anim.setDuration(300)
        anim.setStartValue(0.0)
        anim.setEndValue(1.0)
        anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        # Explicitly pin to 1.0 so floating-point drift can never leave the
        # window semi-transparent.
        anim.finished.connect(lambda: self.setWindowOpacity(1.0))
        anim.start(QPropertyAnimation.DeletionPolicy.DeleteWhenStopped)

    # ── Drag-to-move ────────────────────────────────────────────────────────
    # Delta-based approach: record where the mouse was on press, then on each
    # move compute how far it travelled and shift the window by that delta.
    # This works even when the cursor is over a child label because labels do
    # not accept mouse events by default and the event bubbles up to us.
    # QPushButtons do consume their own press events, so they are naturally
    # excluded from initiating a drag.

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            child = self.childAt(event.position().toPoint())
            # Allow drag unless the click landed on an interactive button.
            if not isinstance(child, QPushButton):
                self._drag_pos = event.globalPosition().toPoint()
        event.accept()

    def mouseMoveEvent(self, event):
        if self._drag_pos is not None:
            delta = event.globalPosition().toPoint() - self._drag_pos
            self.move(self.x() + delta.x(), self.y() + delta.y())
            self._drag_pos = event.globalPosition().toPoint()
            event.accept()

    def mouseReleaseEvent(self, event):
        self._drag_pos = None
        event.accept()


# ---------------------------------------------------------------------------
# Main character widget
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# AnalysisInputBox — floating query overlay shown on double-click
# ---------------------------------------------------------------------------

class AnalysisInputBox(QWidget):
    """
    Frameless dark input field that slides in near the EduLens character.
    The user can type an optional question before analysis runs.

    Signals:
        submitted(str) – emitted with the query text when Return is pressed
                         (empty string means "auto-analyse, no specific query").
        cancelled()    – emitted when Esc is pressed without submitting.
    """

    submitted = pyqtSignal(str)
    cancelled = pyqtSignal()

    _SS = """
    QWidget#inputRoot {
        background-color: rgba(30, 30, 45, 240);
        border-radius: 14px;
        border: 2px solid #6e5af0;
    }
    QLabel#inputPrompt {
        color: rgba(180, 170, 255, 220);
        font-size: 11px;
        font-weight: bold;
        background: transparent;
    }
    QLineEdit#queryField {
        background-color: rgba(255, 255, 255, 14);
        color: #e8e4ff;
        border: 1px solid rgba(110, 90, 240, 120);
        border-radius: 8px;
        padding: 7px 10px;
        font-size: 13px;
        selection-background-color: rgba(110, 90, 240, 160);
    }
    QLineEdit#queryField:focus {
        border-color: rgba(150, 130, 255, 220);
        background-color: rgba(255, 255, 255, 22);
    }
    QPushButton#btnAnalyse {
        background-color: rgba(110, 75, 240, 220);
        color: white;
        border: 1px solid rgba(160, 130, 255, 180);
        border-radius: 9px;
        padding: 6px 16px;
        font-size: 12px;
        font-weight: bold;
    }
    QPushButton#btnAnalyse:hover  { background-color: rgba(140, 105, 255, 240); }
    QPushButton#btnAnalyse:pressed{ background-color: rgba(80, 55, 190, 240);  }
    QPushButton#btnCancel {
        background-color: transparent;
        color: rgba(160, 155, 200, 180);
        border: 1px solid rgba(110, 90, 240, 70);
        border-radius: 9px;
        padding: 6px 12px;
        font-size: 12px;
    }
    QPushButton#btnCancel:hover { color: rgba(220, 80, 80, 220);
                                   border-color: rgba(220, 80, 80, 140); }
    """

    def __init__(self, anchor: QWidget) -> None:
        """
        anchor – the EduLensCharacter widget; used to position this box
                 relative to the character's screen location.
        """
        super().__init__()
        self._anchor = anchor

        self.setObjectName("inputRoot")
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedWidth(380)
        self.setStyleSheet(self._SS)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 12, 16, 14)
        layout.setSpacing(8)

        prompt_lbl = QLabel("🤖  무엇을 분석할까요?")
        prompt_lbl.setObjectName("inputPrompt")
        layout.addWidget(prompt_lbl)

        self._field = QLineEdit()
        self._field.setObjectName("queryField")
        self._field.setPlaceholderText("무엇이 궁금하신가요? (비워두면 자동 분석)")
        self._field.setMaxLength(200)
        self._field.returnPressed.connect(self._submit)
        layout.addWidget(self._field)

        btn_row = QHBoxLayout()
        btn_row.setSpacing(8)

        cancel_btn = QPushButton("취소 (Esc)")
        cancel_btn.setObjectName("btnCancel")
        cancel_btn.clicked.connect(self._cancel)

        analyse_btn = QPushButton("분석 시작  →")
        analyse_btn.setObjectName("btnAnalyse")
        analyse_btn.clicked.connect(self._submit)

        btn_row.addWidget(cancel_btn)
        btn_row.addStretch(1)
        btn_row.addWidget(analyse_btn)
        layout.addLayout(btn_row)

        self.adjustSize()
        self._reposition()

        # Fade in
        self.setWindowOpacity(0.0)
        anim = QPropertyAnimation(self, b"windowOpacity", self)
        anim.setDuration(180)
        anim.setStartValue(0.0)
        anim.setEndValue(1.0)
        anim.finished.connect(lambda: self.setWindowOpacity(1.0))
        anim.start(QPropertyAnimation.DeletionPolicy.DeleteWhenStopped)

    def show(self) -> None:
        super().show()
        self._field.setFocus()

    def keyPressEvent(self, event) -> None:
        if event.key() == Qt.Key.Key_Escape:
            self._cancel()
        else:
            super().keyPressEvent(event)

    # ── Internal ──────────────────────────────────────────────────────────

    def _reposition(self) -> None:
        """Position the box just above the anchor character widget."""
        screen = QApplication.primaryScreen().geometry()
        ag = self._anchor.frameGeometry()
        x = ag.left() + (ag.width() - self.width()) // 2
        y = ag.top() - self.height() - 10
        # If not enough room above, go below instead
        if y < screen.top() + 10:
            y = ag.bottom() + 10
        # Clamp horizontally
        x = max(screen.left() + 8, min(x, screen.right() - self.width() - 8))
        self.move(x, y)

    def _submit(self) -> None:
        query = self._field.text().strip()
        self.submitted.emit(query)
        self.close()

    def _cancel(self) -> None:
        self.cancelled.emit()
        self.close()


# ---------------------------------------------------------------------------
# Main character widget
# ---------------------------------------------------------------------------

CHAR_STYLE_IDLE = """
    color: white;
    background-color: rgba(30, 20, 60, 200);
    border-radius: 44px;
    padding: 14px 18px;
    font-size: 14px;
    font-weight: bold;
    border: 2px solid rgba(120, 100, 255, 160);
"""

CHAR_STYLE_BUSY = """
    color: #c8b4ff;
    background-color: rgba(20, 10, 50, 220);
    border-radius: 44px;
    padding: 14px 18px;
    font-size: 13px;
    font-weight: bold;
    border: 2px solid rgba(180, 140, 255, 200);
"""

CHAR_STYLE_ERROR = """
    color: #ff9090;
    background-color: rgba(50, 10, 10, 210);
    border-radius: 44px;
    padding: 14px 18px;
    font-size: 13px;
    font-weight: bold;
    border: 2px solid rgba(255, 80, 80, 160);
"""

CHAR_STYLE_FOCUS = """
    color: #ffe8a0;
    background-color: rgba(55, 40, 5, 215);
    border-radius: 44px;
    padding: 14px 18px;
    font-size: 12px;
    font-weight: bold;
    border: 2px solid rgba(255, 200, 60, 160);
"""


class EduLensCharacter(QWidget):
    def __init__(self):
        super().__init__()
        self.model = init_gemini()
        self.sb = init_supabase()
        # Read identity from env; fall back to a generated ID
        self.student_id: str = os.getenv("EDU_LENS_STUDENT_ID", f"student_{uuid.uuid4().hex[:6]}")
        self.tool_name: str = os.getenv("EDU_LENS_TOOL_NAME", "edu-lens")

        self._busy = False
        self._hint_win: SocraticHintPanel | None = None
        self._overlay: GuideOverlay | None = None
        self._banner: CriticalBanner | None = None
        self._burst: CongratsBurst | None = None
        self._focus_toast: FocusToast | None = None
        self._input_box: AnalysisInputBox | None = None
        self._dot_count = 0
        self._dot_timer = QTimer(self)
        self._dot_timer.timeout.connect(self._tick_dots)
        self._bridge = AnalysisBridge()
        self._bridge.finished.connect(self._on_analysis_done)
        self._bridge.error.connect(self._on_analysis_error)
        self._bridge.critical_alert.connect(self._on_critical_alert)
        self._bridge.resolve_done.connect(self._on_resolve_done)
        self.initUI()

    # ── UI setup ──────────────────────────────────────────────────────────

    def initUI(self):
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        self.label = QLabel(self)
        self.label.setText("🤖\nEdu-Lens")
        self.label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.label.setStyleSheet(CHAR_STYLE_IDLE)
        self.label.adjustSize()
        self.resize(self.label.sizeHint())
        self.move(100, 100)
        self._oldPos = self.pos()

    # ── Dragging ──────────────────────────────────────────────────────────

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self._oldPos = event.globalPosition().toPoint()

    def mouseMoveEvent(self, event):
        if event.buttons() & Qt.MouseButton.LeftButton:
            delta = event.globalPosition().toPoint() - self._oldPos
            self.move(self.x() + delta.x(), self.y() + delta.y())
            self._oldPos = event.globalPosition().toPoint()

    def mouseDoubleClickEvent(self, event):
        if self._busy:
            return
        self._show_input_box()

    # ── Query input box ───────────────────────────────────────────────────

    def _show_input_box(self) -> None:
        """Show the query overlay; analysis starts only after the user submits."""
        if self._input_box is not None:
            self._input_box.close()
        self._input_box = AnalysisInputBox(anchor=self)
        self._input_box.submitted.connect(self._on_query_submitted)
        self._input_box.cancelled.connect(self._on_query_cancelled)
        self._input_box.show()

    def _on_query_submitted(self, query: str) -> None:
        self._input_box = None
        self._start_analysis(user_query=query)

    def _on_query_cancelled(self) -> None:
        self._input_box = None

    # ── Analysis flow ─────────────────────────────────────────────────────

    def _start_analysis(self, user_query: str = "") -> None:
        self._busy = True
        self._dot_count = 0
        self.label.setStyleSheet(CHAR_STYLE_BUSY)
        self._dot_timer.start(400)

        thread = threading.Thread(
            target=self._run_analysis, args=(user_query,), daemon=True
        )
        thread.start()

    def _run_analysis(self, user_query: str = "") -> None:
        try:
            result = capture_and_analyze(self.model, user_query=user_query)

            # No stall detected — emit immediately without logging to Supabase.
            if result.get("no_stall"):
                self._bridge.finished.emit(result)
                return

            # Persist to Supabase (blocking, but already on worker thread)
            log_row = save_stall_event(
                sb=self.sb,
                student_id=self.student_id,
                tool_name=self.tool_name,
                ai_hint=result.get("hint_level_1", ""),
                screenshot_path="current_screen.png",
            )
            result["_log_status"] = log_row.get("status", "stalled")

            self._bridge.finished.emit(result)

            if result["_log_status"] == "critical":
                self._bridge.critical_alert.emit(self.student_id)

        except WorkspaceNotFocusedError as e:
            # Encode the app name in the error message with a sentinel prefix
            self._bridge.error.emit(f"__focus__:{e.app_name}")
        except json.JSONDecodeError as e:
            self._bridge.error.emit(f"JSON parse error: {e}")
        except Exception as e:
            self._bridge.error.emit(str(e))

    def _tick_dots(self):
        self._dot_count = (self._dot_count + 1) % 4
        dots = "." * self._dot_count
        self.label.setText(f"🔍\n분석 중{dots}")

    def _stop_dots(self):
        self._dot_timer.stop()
        self._busy = False

    # ── Result handlers ────────────────────────────────────────────────────

    def _on_analysis_done(self, result: dict):
        self._stop_dots()

        # ── No stall: show a brief "all clear" label and exit early ─────────
        if result.get("no_stall"):
            self.label.setText("✅\n문제없어 보여요!\n계속 진행하세요!")
            self.label.setStyleSheet(CHAR_STYLE_IDLE)
            QTimer.singleShot(4000, self._reset_label)
            return

        log_status = result.pop("_log_status", "stalled")
        print("진단 결과:", json.dumps(result, ensure_ascii=False, indent=2))

        # Draw highlight overlay — map 0-1000 Gemini coords → real pixels
        # Coords are relative to the cropped window, so use the window rect.
        loc = result.get("problem_location")
        win_rect_tuple = result.pop("_window_rect", None)
        if isinstance(loc, list) and len(loc) == 4:
            if self._overlay:
                self._overlay.dismiss()
            if win_rect_tuple:
                wx, wy, ww, wh = win_rect_tuple
                mapping_rect = QRect(wx, wy, ww, wh)
            else:
                mapping_rect = QApplication.primaryScreen().geometry()
            rect = map_gemini_coords_to_screen(loc, mapping_rect)
            self._overlay = GuideOverlay(rect, error_type=result.get("error_type", ""))
            self._overlay.show()

        # Show Socratic hint panel
        if self._hint_win:
            self._hint_win.close()
        self._hint_win = SocraticHintPanel(result, log_status=log_status)
        self._hint_win.resolved.connect(self._on_student_resolved)
        screen = QApplication.primaryScreen().geometry()
        hw = self._hint_win.sizeHint()
        self._hint_win.move(
            screen.x() + (screen.width() - hw.width()) // 2,
            screen.y() + screen.height() // 3,
        )
        self._hint_win.show()

        self.label.setText("💡\nEdu-Lens")
        self.label.setStyleSheet(CHAR_STYLE_IDLE)

    def _on_analysis_error(self, msg: str):
        self._stop_dots()
        if msg.startswith("__focus__:"):
            app_name = msg[len("__focus__:"):]
            print(f"[Focus] Not a workspace tool: {app_name}")
            self.label.setText("👁\n개발 도구 창을\n선택해 주세요!")
            self.label.setStyleSheet(CHAR_STYLE_FOCUS)
            if self._focus_toast:
                self._focus_toast.close()
            self._focus_toast = FocusToast(app_name)
            self._focus_toast.show()
            QTimer.singleShot(5000, self._reset_label)
        else:
            print(f"오류 발생: {msg}")
            self.label.setText("❌\n오류 발생")
            self.label.setStyleSheet(CHAR_STYLE_ERROR)
            QTimer.singleShot(3000, self._reset_label)

    def _on_critical_alert(self, student_id: str):
        if self._banner:
            self._banner.close()
        self._banner = CriticalBanner(student_id)
        self._banner.show()

    def _on_student_resolved(self):
        """Student clicked 'Mark Resolved' — play burst and log to Supabase."""
        # Dismiss overlay immediately
        if self._overlay:
            self._overlay.dismiss()
            self._overlay = None

        # Confetti burst
        self._burst = CongratsBurst()
        self._burst.show()

        # Update character label
        self.label.setText("🎉\nResolved!")
        self.label.setStyleSheet(CHAR_STYLE_IDLE)
        QTimer.singleShot(3000, self._reset_label)

        # Persist to Supabase on worker thread
        thread = threading.Thread(target=self._run_resolve, daemon=True)
        thread.start()

    def _run_resolve(self):
        try:
            save_resolve_event(self.sb, self.student_id, self.tool_name)
            self._bridge.resolve_done.emit()
        except Exception as e:
            print(f"[Supabase] resolve log failed: {e}")

    def _on_resolve_done(self):
        print("[Supabase] Resolve event logged successfully.")

    def _reset_label(self):
        self.label.setText("🤖\nEdu-Lens")
        self.label.setStyleSheet(CHAR_STYLE_IDLE)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setFont(QFont("Segoe UI", 10))
    ex = EduLensCharacter()
    ex.show()
    sys.exit(app.exec())
