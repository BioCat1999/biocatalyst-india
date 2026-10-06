import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool, migrate } from "@biocatalyst/db";
import { listIssueReports, type IssueStatus } from "@biocatalyst/data";
import { isAdminRequest } from "@/lib/admin";

/**
 * GET /api/v1/admin/issues — list issue/correction reports (Milestone 8).
 *
 * Admin-gated exactly like the other /api/v1/admin/* endpoints: open in
 * development, otherwise requires `Authorization: Bearer <ADMIN_TOKEN>`
 * matching the server env var (see src/lib/admin.ts). Newest first;
 * `?status=open|reviewed|resolved|dismissed` filters.
 */
const querySchema = z.object({
  status: z.enum(["open", "reviewed", "resolved", "dismissed"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "forbidden — admin token required" }, { status: 403 });
  }
  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid query parameters" }, { status: 400 });
  }
  try {
    const pool = getPool();
    await migrate(pool);
    const reports = await listIssueReports(
      parsed.data.status as IssueStatus | undefined,
      parsed.data.limit,
    );
    return NextResponse.json({ status: "ok", reports });
  } catch (err) {
    return NextResponse.json(
      { status: "degraded", error: (err as Error).message },
      { status: 503 },
    );
  }
}
