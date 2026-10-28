/**
 * Visual identity for each kind of catalyst — one accent color, a soft tint
 * and an icon. Mirrors the mobile app (apps/mobile/src/lib/categories.ts) so
 * the same kind of news looks the same on every device.
 */
import type { CSSProperties } from "react";
import type { EventType } from "@biocatalyst/types";
import type { IconName } from "@/components/Icon";

export interface CategoryStyle {
  color: string;
  soft: string;
  icon: IconName;
}

export const PALETTE = {
  teal: { color: "#007f7a", soft: "#dcf8f2" },
  blue: { color: "#1f63d6", soft: "#e6efff" },
  green: { color: "#1c7a3d", soft: "#e7f5ec" },
  red: { color: "#b3261e", soft: "#fbeae9" },
  amber: { color: "#9a6a00", soft: "#fdf3dd" },
  violet: { color: "#6d4bd8", soft: "#efeafd" },
  rose: { color: "#c2335f", soft: "#fdeaf0" },
  slate: { color: "#12406b", soft: "#eef2f6" },
} as const;

const TRIAL = { ...PALETTE.blue, icon: "flask" } as const;
const WIN = { ...PALETTE.green, icon: "check-circle" } as const;
const LOSS = { ...PALETTE.red, icon: "x-circle" } as const;
const WARN = { ...PALETTE.amber, icon: "alert" } as const;
const REG = { ...PALETTE.teal, icon: "shield-check" } as const;
const DEAL = { ...PALETTE.violet, icon: "link" } as const;
const MARKET = { ...PALETTE.rose, icon: "trending-up" } as const;
const INFO = { ...PALETTE.slate, icon: "file-text" } as const;

const EVENT_STYLES: Record<EventType, CategoryStyle> = {
  clinical_trial_started: { ...TRIAL, icon: "play-circle" },
  clinical_trial_status_changed: { ...TRIAL, icon: "refresh" },
  clinical_trial_result: TRIAL,
  primary_endpoint_met: { ...WIN, icon: "trophy" },
  primary_endpoint_missed: { ...LOSS, icon: "trending-down" },
  safety_signal: WARN,
  regulatory_submission: { ...REG, icon: "send" },
  regulatory_approval: { ...WIN, icon: "award" },
  regulatory_rejection_or_deficiency: LOSS,
  regulatory_committee_update: { ...REG, icon: "users" },
  manufacturing_or_inspection_update: { ...WARN, icon: "factory" },
  drug_shortage: { ...WARN, icon: "pill" },
  securities_regulatory_action: { ...LOSS, icon: "scale" },
  licensing_or_partnership: DEAL,
  acquisition_or_divestiture: { ...DEAL, icon: "briefcase" },
  scientific_publication: { ...INFO, icon: "book" },
  company_pipeline_update: { ...INFO, icon: "git-branch" },
  ipo_filing: { ...MARKET, icon: "file-text" },
  ipo_listing: { ...MARKET, icon: "rocket" },
};

export function eventStyle(type: EventType | string): CategoryStyle {
  return EVENT_STYLES[type as EventType] ?? INFO;
}

const KIND_STYLES: Record<string, CategoryStyle> = {
  trial_completion: TRIAL,
  trial_readout: TRIAL,
  pdufa: { ...REG, icon: "flag" },
  regulatory_decision: REG,
  advisory_committee: { ...REG, icon: "users" },
  patent_expiry: { ...PALETTE.violet, icon: "key" },
  ipo: { ...MARKET, icon: "rocket" },
  earnings: { ...PALETTE.slate, icon: "chart" },
  conference: { ...PALETTE.slate, icon: "users" },
};

export function kindStyle(kind: string): CategoryStyle {
  return KIND_STYLES[kind] ?? { ...PALETTE.amber, icon: "star" };
}

const KIND_LABELS: Record<string, string> = {
  trial_completion: "Trial readout",
  trial_readout: "Trial readout",
  patent_expiry: "Patent expiry",
  pdufa: "PDUFA date",
  advisory_committee: "Advisory committee",
  regulatory_decision: "Regulatory decision",
  conference: "Conference",
  earnings: "Earnings",
  ipo: "IPO",
  other: "Milestone",
};

export function kindLabel(kind: string): string {
  if (KIND_LABELS[kind]) return KIND_LABELS[kind];
  const text = kind.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Inline CSS variables so a component can use var(--c) / var(--s). */
export function styleVars(s: { color: string; soft: string }): CSSProperties {
  return { "--c": s.color, "--s": s.soft } as CSSProperties;
}
