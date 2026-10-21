"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Item { id: string; headline: string; eventType: string; occurredAt: string; note: string; }

export function ResearchLibrary() {
  const [mode, setMode] = useState<"saved" | "history">("saved");
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState("Loading…");
  const load = useCallback(async () => {
    setMessage("Loading…");
    const response = await fetch(`/api/v1/library?mode=${mode}`, { cache: "no-store" });
    if (response.status === 401) { setMessage("Sign in to use your research library."); setItems([]); return; }
    const body = await response.json();
    if (!response.ok) { setMessage(body.error ?? "Could not load library"); return; }
    setItems(body.items); setMessage(body.items.length ? "" : mode === "saved" ? "No saved articles yet." : "No reading history yet.");
  }, [mode]);
  useEffect(() => { void load(); }, [load]);
  return <div style={{ paddingBottom: 48 }}>
    <div className="filters" style={{ marginBottom: 18 }}>
      <button className={`chip ${mode === "saved" ? "active" : ""}`} onClick={() => setMode("saved")}>Saved</button>
      <button className={`chip ${mode === "history" ? "active" : ""}`} onClick={() => setMode("history")}>History</button>
    </div>
    {message && <div className="empty"><p>{message}</p>{message.startsWith("Sign in") && <Link href="/signin">Sign in</Link>}</div>}
    {items.map((item) => <div className="result-row" key={item.id}>
      <small className="muted">{item.eventType.replaceAll("_", " ")} · {new Date(item.occurredAt).toLocaleDateString()}</small>
      <div style={{ marginTop: 5 }}><Link href={`/events/${item.id}`}><strong>{item.headline}</strong></Link></div>
      {item.note && <p className="muted" style={{ marginBottom: 0 }}>Note: {item.note.slice(0, 180)}</p>}
    </div>)}
  </div>;
}
