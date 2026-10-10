/**
 * Admin gating for /api/v1/admin/* (spec §12, §21).
 *
 * POST /api/v1/admin/ingestion/run must never be open in production:
 * it runs only when NODE_ENV=development (local dev) or when the request
 * presents `Authorization: Bearer <ADMIN_TOKEN>` matching the server env
 * var. No secrets are ever returned in responses — the token is compared
 * server-side only.
 */
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function bearerMatches(req: NextRequest, token: string | undefined): boolean {
  if (!token) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") && safeEqual(auth.slice("Bearer ".length), token);
}

export function isAdminRequest(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return bearerMatches(req, process.env.ADMIN_TOKEN);
}

/**
 * Platform cron invocations (Vercel Cron) present
 * `Authorization: Bearer <CRON_SECRET>`. Accept that secret for cron
 * GET triggers without requiring CRON_SECRET to equal ADMIN_TOKEN —
 * the previous setup instruction — so the two values can drift safely.
 * POST admin actions remain ADMIN_TOKEN-only.
 */
export function isCronRequest(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return bearerMatches(req, process.env.CRON_SECRET) || isAdminRequest(req);
}
