import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", service: "biocatalyst-india-web", milestone: 1 });
}
