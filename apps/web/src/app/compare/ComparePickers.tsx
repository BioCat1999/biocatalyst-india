"use client";
import { useRouter } from "next/navigation";

export interface CompanyOption {
  slug: string;
  canonicalName: string;
}

export default function ComparePickers({
  companies,
  aSlug,
  bSlug,
}: {
  companies: CompanyOption[];
  aSlug: string;
  bSlug: string;
}) {
  const router = useRouter();

  const go = (a: string, b: string) => {
    router.push(`/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
  };

  const selectStyle = {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "inherit",
    fontSize: 14,
    maxWidth: "100%",
  } as const;

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: 20,
      }}
    >
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
        A
        <select
          aria-label="Compare company A"
          style={selectStyle}
          value={aSlug}
          onChange={(e) => go(e.target.value, bSlug)}
        >
          {companies.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.canonicalName}
            </option>
          ))}
        </select>
      </label>
      <span style={{ color: "var(--muted)" }}>vs</span>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
        B
        <select
          aria-label="Compare company B"
          style={selectStyle}
          value={bSlug}
          onChange={(e) => go(aSlug, e.target.value)}
        >
          {companies.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.canonicalName}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
