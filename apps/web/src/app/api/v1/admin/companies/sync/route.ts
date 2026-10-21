import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { syncGlobalCompanies } from "@biocatalyst/data";
import { isAdminRequest } from "@/lib/admin";

export const maxDuration = 60;

/** Additively sync the global industry-sponsor catalog from ClinicalTrials.gov. */
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "forbidden — admin token required" }, { status: 403 });
  }
  let target = 1_200;
  try {
    const body = (await req.json()) as { target?: unknown };
    if (body.target !== undefined) target = Number(body.target);
  } catch {
    // An empty request uses the safe default.
  }
  if (!Number.isInteger(target) || target < 1_000 || target > 5_000) {
    return NextResponse.json({ error: "target must be an integer from 1000 to 5000" }, { status: 400 });
  }
  try {
    return NextResponse.json(await syncGlobalCompanies(getPool(), target));
  } catch (error) {
    return NextResponse.json(
      { error: "global company sync failed", detail: (error as Error).message },
      { status: 500 },
    );
  }
}
