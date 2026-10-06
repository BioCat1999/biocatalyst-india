import { NextRequest, NextResponse } from "next/server";
import { getTrial } from "@biocatalyst/data";
import { registrySchema, trialIdSchema } from "@/lib/validate";

/** GET /v1/trials/{registry}/{trial_id} */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ registry: string; trialId: string }> }) {
  const { registry, trialId } = await ctx.params;
  if (!registrySchema.safeParse(registry).success) {
    return NextResponse.json({ error: "unknown registry" }, { status: 400 });
  }
  const decoded = decodeURIComponent(trialId);
  if (!trialIdSchema.safeParse(decoded).success) {
    return NextResponse.json({ error: "invalid trial id" }, { status: 400 });
  }
  const trial = await getTrial(registry, decoded);
  if (!trial) return NextResponse.json({ error: "trial not found" }, { status: 404 });
  return NextResponse.json(trial);
}
