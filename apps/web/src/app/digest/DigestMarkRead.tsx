"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** "Mark all read" button for the digest — clears the digest to empty. */
export default function DigestMarkRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const markRead = async () => {
    setBusy(true);
    try {
      await fetch("/api/v1/alerts/read-all", { method: "POST" });
    } finally {
      setBusy(false);
      router.refresh();
    }
  };

  return (
    <button className="btn" onClick={markRead} disabled={busy}>
      {busy ? "Marking…" : "Mark all read"}
    </button>
  );
}
