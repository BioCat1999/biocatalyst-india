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

export function isAdminRequest(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") && safeEqual(auth.slice("Bearer ".length), token);
}
