/**
 * Canonical TypeScript types for Biocatalyst India.
 * Mirrors the canonical data model in spec §5 (Postgres tables) so the
 * Milestone 2 backend can adopt these contracts 1:1.
 */

/** Event & catalyst taxonomy — spec §6. Closed union; unknown stays null. */
export const EVENT_TYPES = [
  "clinical_trial_started",
  "clinical_trial_status_changed",
  "clinical_trial_result",
  "primary_endpoint_met",
  "primary_endpoint_missed",
  "safety_signal",
  "regulatory_submission",
  "regulatory_approval",
  "regulatory_rejection_or_deficiency",
  "regulatory_committee_update",
  "manufacturing_or_inspection_update",
  "drug_shortage",
  "securities_regulatory_action",
  "licensing_or_partnership",
  "acquisition_or_divestiture",
  "scientific_publication",
  "company_pipeline_update",
  "ipo_filing",
  "ipo_listing",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Human-readable label for an event type (pure helper, safe in client code). */
export function eventTypeLabel(t: EventType): string {
  const map: Record<EventType, string> = {
    clinical_trial_started: "Trial started",
    clinical_trial_status_changed: "Trial status changed",
    clinical_trial_result: "Trial result",
    primary_endpoint_met: "Primary endpoint met",
    primary_endpoint_missed: "Primary endpoint missed",
    safety_signal: "Safety signal",
    regulatory_submission: "Regulatory submission",
    regulatory_approval: "Regulatory approval",
    regulatory_rejection_or_deficiency: "Regulatory rejection / deficiency",
    regulatory_committee_update: "Regulatory committee update",
    manufacturing_or_inspection_update: "Manufacturing / inspection update",
    drug_shortage: "Drug shortage",
    securities_regulatory_action: "Securities regulatory action",
    licensing_or_partnership: "Licensing / partnership",
    acquisition_or_divestiture: "Acquisition / divestiture",
    scientific_publication: "Scientific publication",
    company_pipeline_update: "Pipeline update",
    ipo_filing: "IPO filing",
    ipo_listing: "IPO listing",
  };
  return map[t];
}

export type Outcome = "primary_endpoint_met" | "primary_endpoint_missed" | "unknown";

export type ReviewStatus = "published" | "pending_review" | "rejected";

/** Exchanges the app tracks — NSE/BSE for India, majors for global pharma. */
export type Exchange =
  | "NSE"
  | "BSE"
  | "NYSE"
  | "NASDAQ"
  | "LSE"
  | "EPA"
  | "XETRA"
  | "SWX"
  | "TSE";

/** Currencies for listed securities. */
export type Currency = "INR" | "USD" | "CHF" | "EUR" | "GBP" | "JPY";

export interface Security {
  exchange: Exchange;
  ticker: string;
  currency: Currency;
  isin?: string;
}

export interface Company {
  id: string;
  slug: string;
  canonicalName: string;
  description: string;
  country: string;
  website: string;
  /** Curated aliases for search resolution (spec §17). */
  aliases: string[];
  securities: Security[];
  /**
   * Curated summary of the company's non-India footprint: US/EU revenue
   * share, FDA-approved plants, key foreign subsidiaries. Shown on the
   * company page under "Global footprint".
   */
  globalFootprint?: string;
}

/**
 * A curated India-impact relationship between an Indian company and a
 * global (non-Indian) pharma company — licensing, API supply, a patent
 * expiry that opens a generics opportunity, direct competition, etc.
 */
export type GlobalLinkKind =
  | "licensing"
  | "api_supply"
  | "patent_expiry_opportunity"
  | "competitor"
  | "subsidiary";

export interface GlobalLink {
  id: string;
  /** Indian company slug (null when the link is global-company → theme). */
  companySlug: string | null;
  /** Global company slug. */
  globalCompanySlug: string;
  kind: GlobalLinkKind;
  title: string;
  description: string;
}

/**
 * One Orange Book patent listing — a US patent the NDA holder lists as
 * covering an approved drug product. The monthly Orange Book snapshot is
 * the source; `companyId` resolves the applicant to a tracked company
 * (innovator's own patents, or an Indian company's US NDA holdings).
 * Patents whose applicant matches no tracked company keep null FKs —
 * the cliff tracker still shows them.
 */
export interface OrangeBookPatent {
  id: string;
  patentNumber: string;
  /** NDA number the patent is listed against. */
  applNo: string;
  productNo: string;
  tradeName: string;
  /** Orange Book applicant (full legal name, e.g. "PFIZER INC"). */
  applicant: string;
  activeIngredient: string;
  /** Expiry as listed, YYYY-MM-DD, or null when unparseable. */
  expiryDate: string | null;
  drugSubstanceFlag: boolean;
  drugProductFlag: boolean;
  patentUseCode: string | null;
  /** True when the listing was delisted (no longer enforceable via OB). */
  delisted: boolean;
  companyId: string | null;
  drugId: string | null;
}

export interface DrugCompanyLink {
  companyId: string;
  relationshipType: "sponsor" | "originator" | "licensee" | "manufacturer" | "marketer";
}

export interface Drug {
  id: string;
  slug: string;
  canonicalName: string;
  aliases: string[];
  modality?: string;
  mechanism?: string;
  indications: string[];
  companyLinks: DrugCompanyLink[];
}

export type TrialPhase =
  | "Phase 1"
  | "Phase 1/2"
  | "Phase 2"
  | "Phase 2/3"
  | "Phase 3"
  | "Phase 4"
  | "Preclinical";

export type TrialStatus =
  | "Not yet recruiting"
  | "Recruiting"
  | "Active, not recruiting"
  | "Completed"
  | "Terminated"
  | "Suspended"
  | "Withdrawn";

export interface Trial {
  id: string;
  registry: "CTRI" | "ClinicalTrials.gov";
  registryTrialId: string;
  title: string;
  phase: TrialPhase;
  status: TrialStatus;
  enrollment?: number;
  sponsorCompanyId?: string;
  startDate?: string;
  primaryCompletionDate?: string;
  sourceUrl: string;
  drugIds: string[];
  indications: string[];
  primaryEndpoints?: string[];
}

/** Provenance for every surfaced fact — spec §1. */
export interface SourceRecord {
  id: string;
  title: string;
  publisher: string;
  url: string;
  /** When the source itself was published. */
  publishedAt: string;
  /** When we retrieved/captured it. */
  retrievedAt: string;
  isPrimary: boolean;
}

/** Transparent post-event price movement — spec §9. Fixture/computed, not live. */
export interface MarketReaction {
  /** Exact measurement window, human readable — always stored and displayed. */
  windowDefinition: string;
  /** Window bounds as exchange-local close timestamps (ISO 8601). */
  windowStart: string | null;
  windowEnd: string | null;
  securityTicker: string;
  exchange: Exchange;
  /**
   * Null when no price data covers that side of the window — never
   * fabricated or interpolated (spec §9).
   */
  priceBefore: number | null;
  priceAfter: number | null;
  pctChange: number | null;
  benchmarkName?: string;
  benchmarkPctChange?: number | null;
  relativeChange?: number | null;
  /** Provider name, e.g. "fixture". */
  provider: string;
  /** License/usage note stored per spec §9. */
  licenseMetadata?: string;
}

export interface CatalystEvent {
  id: string;
  eventType: EventType;
  /** When the underlying event occurred (ISO 8601). */
  occurredAt: string;
  /** When the source published it (ISO 8601). */
  publishedAt: string;
  headline: string;
  /** One-line fact. */
  fact: string;
  /** 2–4 sentence / ~80–150 word summary. */
  summary: string;
  /** Neutral catalyst explanation — never a recommendation (spec §6). */
  catalystSummary: string;
  confidence: number;
  reviewStatus: ReviewStatus;
  companyIds: string[];
  drugIds: string[];
  trialIds: string[];
  indication?: string;
  phase?: TrialPhase;
  outcome?: Outcome;
  sources: SourceRecord[];
  marketReaction?: MarketReaction;
}

/** Feed card contract — spec §22. */
export interface EventCard {
  id: string;
  headline: string;
  occurredAt: string;
  eventType: EventType;
  company?: { id: string; slug: string; name: string; ticker: string; exchange: string };
  drug?: { name: string };
  trial?: { id: string; phase: TrialPhase };
  indication?: string;
  fact: string;
  summary: string;
  catalystSummary: string;
  marketReaction?: MarketReaction;
  sources: { title: string; url: string; isPrimary: boolean }[];
  confidence: number;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface EventFilters {
  eventType?: EventType;
  companyId?: string;
  phase?: TrialPhase;
  indication?: string;
  from?: string;
  to?: string;
}

export type WatchlistEntityType = "company" | "drug";

export interface WatchlistItem {
  entityType: WatchlistEntityType;
  entityId: string;
  createdAt: string;
  /** Present on server-resolved items (GET /v1/watchlist). */
  name?: string | null;
  href?: string | null;
}

export interface AlertListItem {
  id: string;
  eventId: string;
  channel: string;
  status: string;
  readAt: string | null;
  createdAt: string;
  headline: string | null;
  eventType: string | null;
  href: string;
}
