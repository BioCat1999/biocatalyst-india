/** Typed API errors — every non-2xx response and transport failure. */

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "server"
  | "invalid_response"
  | "network";

function codeForStatus(status: number): ApiErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "validation";
  return "server";
}

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;
  readonly code: ApiErrorCode;
  /** Parsed response body when the server sent one. */
  readonly body: unknown;

  constructor(status: number, message: string, code?: ApiErrorCode, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code ?? (status === 0 ? "network" : codeForStatus(status));
    this.body = body;
  }

  /** 401 — the caller needs to sign in (watchlist/alerts are auth-gated). */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/** Pull a human-readable message out of a JSON error body like `{error: "..."}`. */
export function errorMessageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error?: unknown }).error;
    if (typeof e === "string" && e.length > 0) return e;
  }
  return fallback;
}
