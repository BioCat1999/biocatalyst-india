"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Monitor {
  id: string;
  name: string;
  keyword: string | null;
  eventTypes: string[];
  countries: string[];
  indications: string[];
  phases: string[];
}

const COUNTRIES = ["", "India", "United States", "United Kingdom", "Netherlands", "Hong Kong"];
const EVENT_TYPES = [
  ["", "Any catalyst"],
  ["clinical_trial_result", "Trial results"],
  ["regulatory_approval", "Approvals"],
  ["safety_signal", "Safety signals"],
  ["licensing_or_partnership", "Deals / partnerships"],
];

export function MonitorManager() {
  const [items, setItems] = useState<Monitor[]>([]);
  const [name, setName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("");
  const [eventType, setEventType] = useState("");
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/monitors", { cache: "no-store" });
    if (response.status === 401) {
      setSignedOut(true);
      setLoading(false);
      return;
    }
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not load monitors");
    setItems(body.items);
    setLoading(false);
  }, []);

  useEffect(() => { void load().catch((error) => { setMessage(error.message); setLoading(false); }); }, [load]);

  async function save() {
    if (!name.trim() || (!keyword.trim() && !country && !eventType)) {
      setMessage("Add a name and at least one keyword, market or catalyst type.");
      return;
    }
    const response = await fetch("/api/v1/monitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(), keyword: keyword.trim() || undefined,
        countries: country ? [country] : [], eventTypes: eventType ? [eventType] : [],
      }),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error ?? "Could not save monitor"); return; }
    setItems((current) => [body, ...current.filter((item) => item.id !== body.id && item.name !== body.name)]);
    setName(""); setKeyword(""); setCountry(""); setEventType(""); setMessage("Monitor saved.");
  }

  async function remove(id: string) {
    const response = await fetch(`/api/v1/monitors/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setItems((current) => current.filter((item) => item.id !== id));
  }

  if (loading) return <div className="empty"><p>Loading monitors…</p></div>;
  if (signedOut) return <div className="empty"><p>Sign in to create personal keyword and market alerts.</p><Link href="/signin">Sign in</Link></div>;

  return (
    <div style={{ display: "grid", gap: 20, paddingBottom: 48 }}>
      <section className="card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Create a smart monitor</h2>
        <p className="muted">Combine a keyword, country and catalyst type. Matching published events appear in Alerts and your digest.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Monitor name" aria-label="Monitor name" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Keyword, ticker, drug or theme" aria-label="Keyword" />
          <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Market">
            {COUNTRIES.map((value) => <option key={value} value={value}>{value || "Any market"}</option>)}
          </select>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} aria-label="Catalyst type">
            {EVENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <button className="button" style={{ marginTop: 14 }} onClick={() => void save()}>Save monitor</button>
        {message && <p className="muted" role="status">{message}</p>}
      </section>
      <section>
        <h2>Saved monitors</h2>
        {items.length === 0 ? <div className="empty"><p>No monitors saved yet.</p></div> : items.map((item) => (
          <div className="result-row" key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div><strong>{item.name}</strong><div className="muted" style={{ marginTop: 5 }}>{[item.keyword, ...item.countries, ...item.eventTypes.map((v) => v.replaceAll("_", " "))].filter(Boolean).join(" · ")}</div></div>
            <button className="button secondary" onClick={() => void remove(item.id)}>Delete</button>
          </div>
        ))}
      </section>
    </div>
  );
}
