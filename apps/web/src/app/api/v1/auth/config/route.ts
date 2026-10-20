import { NextResponse } from "next/server";

/** Public OAuth application metadata; OAuth client IDs are public identifiers. */
export async function GET() {
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!googleClientId) {
    return NextResponse.json(
      { error: "Google sign-in is not configured" },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { googleClientId },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
