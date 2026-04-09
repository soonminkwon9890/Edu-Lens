/**
 * src/lib/api-client.ts
 * ─────────────────────
 * Core HTTP client for the EduLens Python backend.
 *
 * Design goals
 * ────────────
 * • Generic response type  — callers get typed data, never `unknown`.
 * • Discriminated union result  — `{ ok: true; data }` | `{ ok: false; error }`
 *   so every call site is forced to handle the failure path.
 * • No thrown exceptions  — errors are values, not control flow.
 * • Request / response hooks  — thin interceptor slots ready for auth tokens,
 *   logging, or retry logic without rewriting every call site.
 * • Configurable timeout  — defaults to 30 s; override per-call.
 */

// ─── Environment ──────────────────────────────────────────────────────────────

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

const DEFAULT_TIMEOUT_MS = 30_000;

// ─── Typed error ──────────────────────────────────────────────────────────────

/** Structured error returned when a request fails at the network or HTTP level. */
export interface ApiError {
  /** HTTP status code, or 0 for network/timeout errors. */
  status: number;
  /** Human-readable description. */
  message: string;
  /** Raw body from the server — useful for validation errors etc. */
  detail?: unknown;
}

// ─── Result union ─────────────────────────────────────────────────────────────

export type ApiResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: ApiError };

// ─── Request options ──────────────────────────────────────────────────────────

export interface RequestOptions {
  /** Additional headers merged on top of the defaults. */
  headers?: Record<string, string>;
  /** AbortSignal — lets callers cancel an in-flight request. */
  signal?: AbortSignal;
  /** Per-request timeout override (ms). */
  timeoutMs?: number;
}

// ─── Interceptor hooks ────────────────────────────────────────────────────────
//
// These are called synchronously before every request / after every response.
// Replace the no-op defaults with real implementations (e.g. inject JWT tokens,
// refresh expired sessions, log to Datadog).

type RequestInterceptor  = (init: RequestInit) => RequestInit;
type ResponseInterceptor = (response: Response) => void;

let onRequest:  RequestInterceptor  = (init) => init;
let onResponse: ResponseInterceptor = () => {};

export function setRequestInterceptor(fn: RequestInterceptor):  void { onRequest  = fn; }
export function setResponseInterceptor(fn: ResponseInterceptor): void { onResponse = fn; }

// ─── Internal fetch wrapper ───────────────────────────────────────────────────

async function send<T>(
  path: string,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal } = options;

  // Merge caller headers into the init object then run the request interceptor
  const mergedInit: RequestInit = onRequest({
    ...init,
    headers: {
      Accept: "application/json",
      ...init.headers,
      ...options.headers,
    },
  });

  // Combine an internal timeout signal with any external signal from the caller
  const timeoutController = new AbortController();
  const timerId = setTimeout(
    () => timeoutController.abort(new DOMException("Request timed out", "TimeoutError")),
    timeoutMs,
  );

  const combinedSignal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...mergedInit,
      signal: combinedSignal,
    });

    clearTimeout(timerId);
    onResponse(response);

    // Parse the body once — handles both JSON and plain-text error messages
    const contentType = response.headers.get("content-type") ?? "";
    const body: unknown = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      return {
        ok: false,
        error: {
          status:  response.status,
          message: extractMessage(body, response.statusText),
          detail:  body,
        },
      };
    }

    return { ok: true, data: body as T };
  } catch (err) {
    clearTimeout(timerId);

    if (err instanceof DOMException && err.name === "AbortError") {
      const isTimeout = err.message === "Request timed out";
      return {
        ok: false,
        error: {
          status:  isTimeout ? 408 : 499,
          message: isTimeout
            ? `Request timed out after ${timeoutMs} ms`
            : "Request was cancelled",
        },
      };
    }

    return {
      ok: false,
      error: {
        status:  0,
        message: err instanceof Error ? err.message : "Unknown network error",
      },
    };
  }
}

/** Pull the most descriptive message out of an arbitrary server body. */
function extractMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.length > 0) return body;
  if (typeof body === "object" && body !== null) {
    const b = body as Record<string, unknown>;
    const candidate = b["detail"] ?? b["message"] ?? b["error"];
    if (typeof candidate === "string") return candidate;
    if (typeof candidate !== "undefined") return JSON.stringify(candidate);
  }
  return fallback;
}

// ─── Public API surface ───────────────────────────────────────────────────────

/**
 * Type-safe HTTP client for the EduLens Python backend.
 *
 * @example
 * // GET with typed response
 * const result = await apiClient.get<AnalysisResult[]>("/analysis/history");
 * if (result.ok) console.log(result.data);
 *
 * // POST JSON body
 * const result = await apiClient.post<AnalysisResult>("/analyze", { student_id: "s1" });
 *
 * // POST multipart form-data (do NOT set Content-Type — browser sets boundary)
 * const form = new FormData();
 * form.append("file", file);
 * const result = await apiClient.postForm<AnalysisResult>("/analyze/upload", form);
 */
export const apiClient = {
  /**
   * Sends a GET request and returns `ApiResult<T>`.
   */
  get<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return send<T>(path, { method: "GET" }, options);
  },

  /**
   * Sends a POST request with a JSON body.
   * `Content-Type: application/json` is added automatically.
   */
  post<T>(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<ApiResult<T>> {
    return send<T>(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      options,
    );
  },

  /**
   * Sends a POST request with a `FormData` body (multipart/form-data).
   * Do **not** set `Content-Type` manually — the browser must generate the
   * boundary token automatically.
   */
  postForm<T>(
    path: string,
    form: FormData,
    options?: RequestOptions,
  ): Promise<ApiResult<T>> {
    return send<T>(path, { method: "POST", body: form }, options);
  },

  /**
   * Sends a PATCH request with a JSON body.
   */
  patch<T>(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<ApiResult<T>> {
    return send<T>(
      path,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      options,
    );
  },

  /**
   * Sends a DELETE request.
   */
  delete<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return send<T>(path, { method: "DELETE" }, options);
  },
} as const;
