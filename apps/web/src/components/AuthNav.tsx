"use client";
/**
 * Header session widget — Milestone 6 (spec §14).
 *
 * Anonymous: Sign in / Sign up links. Signed in: notification bell with the
 * unread-count badge, the account email, and Sign out. The bell links to the
 * notification center at /alerts.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface SessionState {
  loading: boolean;
  email: string | null;
  unread: number;
}

export function AuthNav() {
  const router = useRouter();
  const [state, setState] = useState<SessionState>({ loading: true, email: null, unread: 0 });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/session", { cache: "no-store" });
      if (!res.ok) {
        setState({ loading: false, email: null, unread: 0 });
        return;
      }
      const { user } = await res.json();
      let unread = 0;
      try {
        const a = await fetch("/api/v1/alerts", { cache: "no-store" });
        if (a.ok) unread = (await a.json()).unreadCount ?? 0;
      } catch {
        /* alerts unavailable — badge stays 0 */
      }
      setState({ loading: false, email: user.email, unread });
    } catch {
      setState({ loading: false, email: null, unread: 0 });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = async () => {
    await fetch("/api/v1/auth/signout", { method: "POST" });
    setState({ loading: false, email: null, unread: 0 });
    router.refresh();
  };

  if (state.loading) return null;

  if (!state.email) {
    return (
      <span className="authnav">
        <Link className="btn btn-ghost-light" href="/signin">
          Sign in
        </Link>
        <Link className="btn btn-primary" href="/signup">
          Sign up
        </Link>
      </span>
    );
  }

  return (
    <span className="authnav">
      <Link
        className="bell"
        href="/alerts"
        aria-label={state.unread > 0 ? `Alerts, ${state.unread} unread` : "Alerts"}
        title="Notification center"
      >
        <span aria-hidden="true">🔔</span>
        {state.unread > 0 && (
          <span className="bell-badge" aria-hidden="true">
            {state.unread > 99 ? "99+" : state.unread}
          </span>
        )}
      </Link>
      <span className="authnav-email" title={state.email}>
        {state.email}
      </span>
      <button type="button" className="btn btn-ghost-light" onClick={signOut}>
        Sign out
      </button>
    </span>
  );
}
