import { NextRequest, NextResponse } from "next/server";
import { getEvent } from "@biocatalyst/data";

/** GET /v1/events/{id} — full event with sources and market reaction. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const event = await getEvent(id);
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });
  return NextResponse.json(event);
}
