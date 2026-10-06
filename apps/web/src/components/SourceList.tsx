import type { SourceRecord } from "@biocatalyst/types";
import { formatDateTime } from "@/lib/format";

export function SourceList({ sources }: { sources: SourceRecord[] }) {
  return (
    <ul className="source-list">
      {sources.map((s) => (
        <li key={s.id}>
          <a href={s.url} target="_blank" rel="noopener noreferrer">
            {s.title}
          </a>{" "}
          {s.isPrimary && <span className="tag positive">Primary</span>}
          <div className="pub">
            {s.publisher} · Published {formatDateTime(s.publishedAt)} · Retrieved{" "}
            {formatDateTime(s.retrievedAt)}
          </div>
        </li>
      ))}
    </ul>
  );
}
