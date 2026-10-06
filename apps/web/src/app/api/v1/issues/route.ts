import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool, migrate } from "@biocatalyst/db";
import { createIssueReport, ISSUE_CATEGORIES } from "@biocatalyst/data";

/**
 * POST /api/v1/issues — "report an issue" on an event (Milestone 8, spec §21
 * data-correction mechanism; spec §4.2 "report an issue" action).
 *
 * Anonymous (no auth required — reporting must be frictionless). Zod-validated,
 * stored in-app in `issue_reports` (migration 008). Zero third-party form
 * services. Public rate limit (120/min/IP, middleware) applies.
 *
 * Body: { event_id: uuid, category: enum, description: 10–2000 chars,
 *         contact?: 1–200 chars (optional email for follow-up) }
 */
const issueBodySchema = z.object({
  event_id: z.string().uuid({ message: "event_id must be a UUID" }),
  category: z.enum(ISSUE_CATEGORIES),
  description: z
    .string()
    .trim()
    .min(10, { message: "description must be at least 10 characters" })
    .max(2000, { message: "description must be at most 2000 characters" }),
  contact: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "request body must be JSON" }, { status: 400 });
  }
  const parsed = issueBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid issue report",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const pool = getPool();
    await migrate(pool); // idempotent — keeps standalone/dev DBs in sync
    const report = await createIssueReport({
      eventId: parsed.data.event_id,
      category: parsed.data.category,
      description: parsed.data.description,
      contact: parsed.data.contact,
    });
    return NextResponse.json(
      { status: "received", report },
      { status: 201 },
    );
  } catch (err) {
    // Unknown event_id → foreign-key violation: report it as a 400, not a 500.
    const message = (err as Error).message;
    if (message.includes("issue_reports_event_id_fkey") || message.includes("violates foreign key")) {
      return NextResponse.json(
        { error: "unknown event_id — no such event" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "could not store issue report" }, { status: 500 });
  }
}
