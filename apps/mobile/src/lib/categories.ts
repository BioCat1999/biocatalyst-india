/**
 * Visual identity for each kind of catalyst: one accent color, a soft
 * background tint and an icon. Used by feed cards, chips and the calendar so
 * the same kind of news always looks the same.
 */
import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";
import type { EventType } from "@biocatalyst/types";
import { colors } from "../theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export interface CategoryStyle {
  color: string;
  soft: string;
  icon: IconName;
}

const TRIAL: CategoryStyle = { color: colors.blue, soft: colors.blueSoft, icon: "flask" };
const WIN: CategoryStyle = { color: colors.green, soft: colors.greenSoft, icon: "checkmark-circle" };
const LOSS: CategoryStyle = { color: colors.red, soft: colors.redSoft, icon: "close-circle" };
const WARN: CategoryStyle = { color: colors.amber, soft: colors.amberSoft, icon: "warning" };
const REG: CategoryStyle = { color: colors.teal, soft: colors.tealSoft, icon: "shield-checkmark" };
const DEAL: CategoryStyle = { color: colors.violet, soft: colors.violetSoft, icon: "git-merge" };
const MARKET: CategoryStyle = { color: colors.rose, soft: colors.roseSoft, icon: "trending-up" };
const INFO: CategoryStyle = { color: colors.navy3, soft: colors.slateSoft, icon: "newspaper" };

const EVENT_STYLES: Record<EventType, CategoryStyle> = {
  clinical_trial_started: { ...TRIAL, icon: "play-circle" },
  clinical_trial_status_changed: { ...TRIAL, icon: "sync-circle" },
  clinical_trial_result: TRIAL,
  primary_endpoint_met: { ...WIN, icon: "trophy" },
  primary_endpoint_missed: { ...LOSS, icon: "trending-down" },
  safety_signal: { ...WARN, icon: "alert-circle" },
  regulatory_submission: { ...REG, icon: "paper-plane" },
  regulatory_approval: { ...WIN, icon: "ribbon" },
  regulatory_rejection_or_deficiency: LOSS,
  regulatory_committee_update: { ...REG, icon: "people" },
  manufacturing_or_inspection_update: { ...WARN, icon: "construct" },
  drug_shortage: { ...WARN, icon: "medkit" },
  securities_regulatory_action: { ...LOSS, icon: "hammer" },
  licensing_or_partnership: { ...DEAL, icon: "hand-left" },
  acquisition_or_divestiture: { ...DEAL, icon: "business" },
  scientific_publication: { ...INFO, icon: "school" },
  company_pipeline_update: { ...INFO, icon: "git-branch" },
  ipo_filing: { ...MARKET, icon: "document-text" },
  ipo_listing: { ...MARKET, icon: "rocket" },
};

export function eventStyle(type: EventType | string): CategoryStyle {
  return EVENT_STYLES[type as EventType] ?? INFO;
}

/** Calendar milestone kinds (trial/patent rows plus free-form milestone kinds). */
const KIND_STYLES: Record<string, CategoryStyle> = {
  trial_completion: TRIAL,
  pdufa: { ...REG, icon: "flag" },
  patent_expiry: { color: colors.violet, soft: colors.violetSoft, icon: "key" },
  regulatory_decision: { ...REG, icon: "shield-checkmark" },
};

export function kindStyle(kind: string): CategoryStyle {
  return KIND_STYLES[kind] ?? { color: colors.amber, soft: colors.amberSoft, icon: "star" };
}

export function kindLabel(kind: string): string {
  const named: Record<string, string> = {
    trial_completion: "Trial readout",
    pdufa: "PDUFA date",
    patent_expiry: "Patent expiry",
    regulatory_decision: "Regulatory decision",
  };
  if (named[kind]) return named[kind];
  const text = kind.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
