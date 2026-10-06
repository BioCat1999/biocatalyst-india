import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — Biocatalyst India",
  description: "You are offline. Cached pages remain available; new data needs a connection.",
};

export default function OfflinePage() {
  return (
    <article className="panel" style={{ maxWidth: 640 }}>
      <h1>You&apos;re offline</h1>
      <p>
        Biocatalyst India needs an internet connection to fetch fresh catalyst
        data. Pages you have already visited may still be available from the
        on-device cache — use your browser&apos;s back button to try them.
      </p>
      <p className="muted">
        Your watchlist and settings are stored locally and are unchanged.
      </p>
      <p>
        <a href="/">Retry the home feed</a>
      </p>
    </article>
  );
}
