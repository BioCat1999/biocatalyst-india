/** Format an ISO timestamp for Indian audiences (IST). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(d);
}

/** Format an ISO date (no time). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(d);
}

/** "+4.81%" / "-2.54%" / "0.00%" */
export function formatPct(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/** Market-reaction direction class for styling. */
export function mrClass(n: number): "mr-up" | "mr-down" | "mr-flat" {
  if (n > 0.05) return "mr-up";
  if (n < -0.05) return "mr-down";
  return "mr-flat";
}
