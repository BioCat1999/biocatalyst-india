"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function SearchHero() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  return (
    <form
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
        placeholder="Company, ticker, drug, trial ID or indication…"
        aria-label="Search"
        autoFocus
      />
    </form>
  );
}

export function SearchHeroSuspense() {
  return (
    <Suspense>
      <SearchHero />
    </Suspense>
  );
}
