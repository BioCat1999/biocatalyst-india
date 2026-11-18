import { importanceLabel, type Importance } from "@biocatalyst/types";

/** Major / Notable / Routine tag. `onDark` is for the navy event hero. */
export function ImportancePill({ level, onDark = false }: { level: Importance; onDark?: boolean }) {
  return (
    <span
      className={`imp imp-${level}${onDark ? " imp-dark" : ""}`}
      title="How significant this kind of event usually is"
    >
      {importanceLabel(level)}
    </span>
  );
}
