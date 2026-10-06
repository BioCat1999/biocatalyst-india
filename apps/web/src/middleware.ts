/**
 * Basic rate limiting for public API endpoints (spec §21).
 *
 * Fixed-window per-IP counter: 120 requests / 60s per client on /api/v1/*.
 * Auth endpoints (/api/v1/auth/*) get a stricter 20 requests / 60s: they are
 * the brute-force surface (login/signup), and legitimate users never need
 * more. In-memory by design for Milestone 2 (single instance). A
 * multi-instance deployment should move this to Redis/KV — see
 * docs/decisions.md.
 */
import { NextRequest, NextResponse } from "next/server";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;
/** Stricter budget for credential endpoints (brute-force protection). */
const AUTH_MAX_REQUESTS = 20;

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

function clientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return ip;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api/v1/")) return NextResponse.next();

  const isAuth = pathname.startsWith("/api/v1/auth/");
  const max = isAuth ? AUTH_MAX_REQUESTS : MAX_REQUESTS;
  const key = `${isAuth ? "auth:" : ""}${clientKey(req)}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  // Opportunistic cleanup so the map can't grow unboundedly.
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) {
      if (now >= b.resetAt) buckets.delete(k);
    }
  }
  bucket.count += 1;
  if (bucket.count > max) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "rate limit exceeded — slow down and retry" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/v1/:path*",
};
