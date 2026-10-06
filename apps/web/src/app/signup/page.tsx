"use client";
/**
 * Sign-up page — Milestone 6 (spec §14). Local auth only; no third-party
 * providers. Passwords are hashed server-side with scrypt and never stored
 * or returned in plaintext.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Sign-up failed");
        return;
      }
      router.push("/watchlist");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Sign up</h1>
        <p>
          Create an account to follow companies and drugs and get in-app
          alerts for new high-confidence catalysts.
        </p>
      </div>
      <form className="auth-form" onSubmit={submit} aria-label="Sign up">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Password (minimum 8 characters)</span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Creating account…" : "Sign up"}
        </button>
        <p className="form-note">
          Already have an account? <Link href="/signin">Sign in</Link>
        </p>
      </form>
    </>
  );
}
