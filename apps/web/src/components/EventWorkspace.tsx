"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function EventWorkspace({ eventId }: { eventId: string }) {
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState("");
  const [available, setAvailable] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/v1/events/${encodeURIComponent(eventId)}/state`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markRead: true }),
    }).then(async (response) => {
      if (!active) return;
      if (response.status === 401) { setAvailable(false); return; }
      if (response.ok) {
        const state = await response.json(); setSaved(state.saved); setNote(state.note);
      }
    });
    return () => { active = false; };
  }, [eventId]);

  async function update(input: { saved?: boolean; note?: string }) {
    const response = await fetch(`/api/v1/events/${encodeURIComponent(eventId)}/state`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    });
    if (!response.ok) { setMessage("Could not save."); return; }
    const state = await response.json(); setSaved(state.saved); setNote(state.note); setMessage("Saved.");
  }

  if (!available) return <p className="muted"><Link href="/signin">Sign in</Link> to save this item and add private notes.</p>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <button className="button secondary" onClick={() => void update({ saved: !saved })}>{saved ? "★ Saved" : "☆ Save article"}</button>
      <textarea value={note} maxLength={5000} rows={5} onChange={(event) => setNote(event.target.value)} placeholder="Add private research notes…" />
      <button className="button" onClick={() => void update({ note })}>Save note</button>
      {message && <small className="muted" role="status">{message}</small>}
    </div>
  );
}
