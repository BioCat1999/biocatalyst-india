import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool, migrate } from "@biocatalyst/db";
import {
  createAdapter,
  listSourceNames,
  runAllIngestion,
  runIngestion,
} from "@biocatalyst/ingestion";
import { isAdminRequest, isCronRequest } from "@/lib/admin";

/**
 * POST /api/v1/admin/ingestion/run (spec §12).
 *
 * Runs one ingestion pass. Gated: allowed only in development or with a
 * valid `Authorization: Bearer <ADMIN_TOKEN>` header — never open in
 * production (see src/lib/admin.ts). Optional source selection:
 *  - JSON body `{ "source": "bse-fixture" }` for one adapter,
 *    `{ "source": "all" }` (or no body) for every registered adapter; or
 *  - query param `?source=<name>` (body takes precedence when both given).
 *
 * Single-source runs return the run metrics object (as in M3); "all"
 * returns `{ sources: [...] }` with one metrics object per source.
 */
const bodySchema = z.object({
  source: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "forbidden — admin token required" }, { status: 403 });
  }
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const sourceName = parsed.data.source ?? req.nextUrl.searchParams.get("source") ?? "all";
  try {
    const pool = getPool();
    await migrate(pool); // idempotent — ensures migrations are applied
    if (sourceName === "all") {
      const sources = await runAllIngestion(pool);
      return NextResponse.json(
        { sources },
        { status: sources.some((m) => m.status !== "success") ? 500 : 200 },
      );
    }
    const adapter = createAdapter(sourceName);
    if (!adapter) {
      return NextResponse.json(
        { error: `unknown source: ${sourceName}`, knownSources: listSourceNames() },
        { status: 400 },
      );
    }
    const metrics = await runIngestion(pool, adapter);
    return NextResponse.json(metrics, {
      status: metrics.status === "success" ? 200 : 500,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "ingestion failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}

/**
 * GET variant for platform cron triggers (e.g. Vercel Cron), which issue
 * GET requests. Gating: `Authorization: Bearer <CRON_SECRET>` (sent
 * automatically by Vercel when CRON_SECRET is set) or the ADMIN_TOKEN.
 * Runs the full ingestion pass by default, or a
 * single source with `?source=<name>` — the hourly PR Newswire workflow
 * (GitHub Actions, `.github/workflows/ingest-prnewswire-hourly.yml`)
 * uses `?source=prnewswire` so the other sources are not re-run hourly.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "forbidden — admin token required" }, { status: 403 });
  }
  const sourceName = req.nextUrl.searchParams.get("source") ?? "all";
  try {
    const pool = getPool();
    await migrate(pool); // idempotent — ensures migrations are applied
    if (sourceName === "all") {
      const sources = await runAllIngestion(pool);
      return NextResponse.json(
        { sources },
        { status: sources.some((m) => m.status !== "success") ? 500 : 200 },
      );
    }
    const adapter = createAdapter(sourceName);
    if (!adapter) {
      return NextResponse.json(
        { error: `unknown source: ${sourceName}`, knownSources: listSourceNames() },
        { status: 400 },
      );
    }
    const metrics = await runIngestion(pool, adapter);
    return NextResponse.json(metrics, {
      status: metrics.status === "success" ? 200 : 500,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "ingestion failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
