import type { NormalizedCandidate } from "./adapter.js";

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";

function isoDate(value: string): string | null {
  const parsed = new Date(`${value} 12:00:00 UTC`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Extract only explicit day-precision dates; vague guidance stays out. */
export function extractRegulatoryMilestones(
  text: string,
  company: string,
): NonNullable<NormalizedCandidate["calendarMilestones"]> {
  const milestones: NonNullable<NormalizedCandidate["calendarMilestones"]> = [];
  const pdufa = new RegExp(
    `(?:PDUFA|Prescription Drug User Fee Act)[^.!?]{0,100}?(?:date|by|of|on)\\s*(?:is|of|:)?\\s*(${MONTHS})\\s+(\\d{1,2}),\\s+(\\d{4})`,
    "gi",
  );
  for (const match of text.matchAll(pdufa)) {
    const date = isoDate(`${match[1]} ${match[2]}, ${match[3]}`);
    if (!date) continue;
    milestones.push({
      kind: "pdufa",
      date,
      title: `${company} PDUFA target action date`,
      detail: match[0].replace(/\s+/g, " ").trim().slice(0, 300),
      status: "confirmed",
    });
  }
  return milestones.filter((item, index, all) => all.findIndex((other) => other.kind === item.kind && other.date === item.date) === index);
}
