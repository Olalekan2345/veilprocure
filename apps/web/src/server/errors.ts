/** Stable, safe error codes returned to clients. Messages never include internal details. */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PRECONDITION_FAILED"
  | "CHAIN_NOT_CONFIGURED"
  | "CHAIN_VERIFICATION_FAILED"
  | "WALLET_REQUIRED"
  | "UPLOAD_REJECTED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PRECONDITION_FAILED: 412,
  CHAIN_NOT_CONFIGURED: 503,
  CHAIN_VERIFICATION_FAILED: 422,
  WALLET_REQUIRED: 412,
  UPLOAD_REJECTED: 415,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string> } };

/**
 * Converts thrown errors into a safe result. Unknown errors are logged server-side without
 * request payloads and surfaced as a generic INTERNAL error.
 */
export function toResult(err: unknown): Extract<ActionResult, { ok: false }> {
  if (err instanceof AppError) {
    return { ok: false, error: { code: err.code, message: err.message, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) } };
  }
  // Next.js control-flow errors (redirect/notFound) must propagate.
  if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string") {
    const digest = (err as { digest: string }).digest;
    if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR")) throw err;
  }
  console.error("[veilprocure] unhandled error:", safeErrorSummary(err));
  return { ok: false, error: { code: "INTERNAL", message: "Something went wrong on our side. Nothing was changed. Please try again." } };
}

/**
 * Log-safe summary. Database driver errors embed SQL *and parameter values* in `message`
 * (e-mails, ciphertext), so for those only the SQLSTATE and a redacted reason are kept.
 */
export function safeErrorSummary(err: unknown): string {
  if (!(err instanceof Error)) return "non-error thrown";
  const cause = (err as { cause?: { code?: string; message?: string } }).cause;
  if (err.message.startsWith("Failed query") || cause?.code) {
    const reason = (cause?.message ?? "").replace(/\(.*?\)=\(.*?\)/g, "(redacted)").slice(0, 200);
    return `DatabaseError sqlstate=${cause?.code ?? "?"} ${reason}`;
  }
  return `${err.name}: ${err.message.slice(0, 300)}`;
}

export function zodFieldErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map(String).join(".") || "_";
    out[key] ??= i.message;
  }
  return out;
}
