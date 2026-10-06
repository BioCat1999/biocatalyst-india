import type { EventType } from "@biocatalyst/types";
import { eventTypeLabel } from "@biocatalyst/data";

const POSITIVE: EventType[] = ["primary_endpoint_met", "regulatory_approval"];
const NEGATIVE: EventType[] = [
  "primary_endpoint_missed",
  "regulatory_rejection_or_deficiency",
  "safety_signal",
];

export function EventTypeTag({ type }: { type: EventType }) {
  const tone = POSITIVE.includes(type)
    ? "positive"
    : NEGATIVE.includes(type)
      ? "negative"
      : "neutral";
  return <span className={`tag ${tone}`}>{eventTypeLabel(type)}</span>;
}
