/** Pure formatting helpers (no React Native imports — unit-testable). */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-29T10:00:00.000Z" -> "29 Sep 2026". Falls back to the raw string. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Compact percent like "+2.4%" / "-1.1%" / "—" for null. */
export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Parse a web `href` from the watchlist API ("/companies/<slug>",
 * "/drugs/<slug>") into a navigation target. Returns null when the href
 * is missing or points somewhere unexpected.
 */
export function parseWatchlistHref(
  href: string | null | undefined,
): { kind: "company" | "drug"; slug: string } | null {
  if (!href) return null;
  const m = href.match(/^\/(companies|drugs)\/([A-Za-z0-9_.-]+)\/?$/);
  if (!m) return null;
  return { kind: m[1] === "companies" ? "company" : "drug", slug: m[2] };
}
