"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Top-bar search box: navigates to /search?q=… */
export function SearchForm({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  return (
    <form
      className="searchbox"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search companies, drugs, trials…"
        aria-label="Search companies, drugs, trials"
      />
    </form>
  );
}
