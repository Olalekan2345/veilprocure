import "server-only";
import { NextResponse } from "next/server";
import { env } from "./env";
import { AppError, toResult } from "./errors";

/** Route-handler CSRF guard: state-changing requests must come from our own origin. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const expected = new URL(env().APP_URL).origin;
  if (!origin || origin !== expected) throw new AppError("FORBIDDEN", "Cross-site request blocked.");
}

export function jsonError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json({ ok: false, error: { code: err.code, message: err.message } }, { status: err.status });
  }
  const r = toResult(err);
  return NextResponse.json(r, { status: 500 });
}
