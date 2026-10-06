import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool, migrate } from "@biocatalyst/db";
import { PUSH_TOKEN_PLATFORMS, upsertPushToken } from "@biocatalyst/data";
import { getSessionToken, requireUserForToken } from "@/lib/auth-server";

/**
 * POST /api/v1/push-tokens — register a device push token for the signed-in
 * user (Milestone 10, spec §14). This is the endpoint the mobile app's
 * push plumbing (apps/mobile/src/push/) POSTs to after acquiring the
 * native device token.
 *
 * Auth required. Zod-validated, idempotent (re-registration only refreshes
 * `updated_at`). Public rate limit (120/min/IP, middleware) applies.
 *
 * This is REGISTRATION storage only — actual push fan-out (FCM/APNs
 * credentials, delivery workers) is deliberately deferred and documented
 * in docs/deployment.md.
 *
 * Body: { token: 1–500 chars, platform: "expo" | "apns" | "fcm" }
 */
const pushTokenBodySchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, { message: "token must not be empty" })
    .max(500, { message: "token must be at most 500 characters" }),
  platform: z.enum(PUSH_TOKEN_PLATFORMS, {
    message: `platform must be one of: ${PUSH_TOKEN_PLATFORMS.join(", ")}`,
  }),
});

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUserForToken(getSessionToken(req));
  } catch (err) {
    return NextResponse.json(
      { error: "authentication required" },
      { status: (err as { status?: number }).status ?? 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "request body must be JSON" }, { status: 400 });
  }
  const parsed = pushTokenBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid push token",
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
    const pushToken = await upsertPushToken({
      userId: user.id,
      token: parsed.data.token,
      platform: parsed.data.platform,
    });
    return NextResponse.json(
      {
        status: "registered",
        pushToken: {
          id: pushToken.id,
          platform: pushToken.platform,
          createdAt: pushToken.createdAt,
          updatedAt: pushToken.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "failed to register push token" },
      { status: 500 },
    );
  }
}
