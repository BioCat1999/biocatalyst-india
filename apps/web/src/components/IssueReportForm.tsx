"use client";

import { useState } from "react";

/**
 * "Report an issue" form — spec §4.2 data-quality action (Milestone 8).
 *
 * Posts to POST /api/v1/issues (anonymous, in-app storage — no third-party
 * form service). Progressive disclosure: a collapsed button expands the form
 * inline so the data-quality panel stays compact.
 */
const CATEGORIES = [
  { value: "incorrect_fact", label: "Incorrect fact in the summary" },
  { value: "wrong_entity_link", label: "Wrong company/drug/trial link" },
  { value: "missing_source", label: "Missing or broken source" },
  { value: "stale_data", label: "Stale or outdated information" },
  { value: "other", label: "Other" },
] as const;

export function IssueReportForm({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("incorrect_fact");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/v1/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          category,
          description: description.trim(),
          ...(contact.trim() ? { contact: contact.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `server returned ${res.status}`);
      }
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  }

  if (!open) {
    return (
      <p style={{ fontSize: 13, marginTop: 12 }}>
        <button type="button" className="linklike" onClick={() => setOpen(true)}>
          Report an issue with this event
        </button>
      </p>
    );
  }

  if (state === "done") {
    return (
      <p style={{ fontSize: 13, marginTop: 12 }} role="status">
        <strong>Thanks — your report was recorded.</strong> The team reviews
        corrections and may update the event or its sources.
      </p>
    );
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 12, display: "grid", gap: 8 }}>
      <label style={{ fontSize: 13 }}>
        What&apos;s wrong?
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ display: "block", width: "100%", marginTop: 4 }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label style={{ fontSize: 13 }}>
        Describe the problem (min 10 characters)
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          minLength={10}
          maxLength={2000}
          required
          style={{ display: "block", width: "100%", marginTop: 4 }}
        />
      </label>
      <label style={{ fontSize: 13 }}>
        Contact (optional — only if you want a reply)
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={200}
          placeholder="email@example.com"
          style={{ display: "block", width: "100%", marginTop: 4 }}
        />
      </label>
      {state === "error" && (
        <p role="alert" style={{ fontSize: 13, color: "#9c2b2e" }}>
          Couldn&apos;t send the report: {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send report"}
        </button>
        <button type="button" className="linklike" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
