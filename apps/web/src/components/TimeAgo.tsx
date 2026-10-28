"use client";
/**
 * Shows "5m ago" / "3h ago" / "2d ago" for recent timestamps. The server
 * renders the absolute date (pages are cached), and the browser swaps in the
 * relative label after hydration so it is always current.
 */
import { useEffect, useState } from "react";

const fmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export function relativeLabel(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const mins = Math.floor((now - t) / 60_000);
  if (mins < 0) return fmt.format(t);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmt.format(t);
}

export function TimeAgo({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() => fmt.format(new Date(iso)));
  useEffect(() => {
    setLabel(relativeLabel(iso));
    const id = window.setInterval(() => setLabel(relativeLabel(iso)), 60_000);
    return () => window.clearInterval(id);
  }, [iso]);
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}>
      {label}
    </time>
  );
}
