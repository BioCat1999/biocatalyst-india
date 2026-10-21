import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { deliverPendingPushNotifications } from "@biocatalyst/notifications";
import { isAdminRequest, isCronRequest } from "@/lib/admin";

async function deliver(req: NextRequest, cron: boolean) {
  if (cron ? !isCronRequest(req) : !isAdminRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await deliverPendingPushNotifications(getPool());
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) { return deliver(req, true); }
export async function POST(req: NextRequest) { return deliver(req, false); }
