"use client";

import { useCallback, useState } from "react";

interface IssueReportView {
  id: string;
  eventId: string;
  category: string;
  description: string;
  contact: string | null;
  status: string;
  createdAt: string;
}

/**
 * Admin issue-report list. The admin pastes their ADMIN_TOKEN; the client
 * calls GET /api/v1/admin/issues with `Authorization: Bearer <token>`, which
 * the API validates via the shared isAdminRequest gate. Token lives only in
 * this tab's state — never in the page HTML, never in a URL.
 */
export function AdminIssueList() {
  const [token, setToken] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reports, setReports] = useState<IssueReportView[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await fetch(`/api/v1/admin/issues${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 403) throw new Error("forbidden — wrong or missing admin token");
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = (await res.json()) as { reports: IssueReportView[] };
      setReports(data.reports);
    } catch (err) {
      setError((err as Error).message);
      setReports(null);
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  return (
    <section className="panel" aria-label="Issue reports">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
        <label style={{ fontSize: 13 }}>
          Admin token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            style={{ display: "block", marginTop: 4 }}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ display: "block", marginTop: 4 }}
          >
            <option value="">all</option>
            <option value="open">open</option>
            <option value="reviewed">reviewed</option>
            <option value="resolved">resolved</option>
            <option value="dismissed">dismissed</option>
          </select>
        </label>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Load reports"}
        </button>
      </div>
      {error && (
        <p role="alert" style={{ color: "#9c2b2e", fontSize: 13 }}>{error}</p>
      )}
      {reports && reports.length === 0 && <p className="muted">No reports match.</p>}
      {reports && reports.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Event</th>
              <th>Category</th>
              <th>Description</th>
              <th>Contact</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>
                  <a href={`/events/${r.eventId}`}>
                    <code style={{ fontSize: 12 }}>{r.eventId.slice(0, 8)}…</code>
                  </a>
                </td>
                <td>{r.category.replaceAll("_", " ")}</td>
                <td style={{ maxWidth: 420 }}>{r.description}</td>
                <td>{r.contact ?? "—"}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
