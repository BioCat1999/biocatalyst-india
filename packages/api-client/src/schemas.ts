/**
 * Zod response schemas for the `/api/v1/*` surface.
 *
 * Every schema mirrors the canonical interface in `@biocatalyst/types`
 * (spec §5/§12) field-for-field. Unknown keys are stripped by zod's
 * default behavior, so the schemas spell out the full shape — the
 * compile-time assertions below fail the build if a schema ever drifts
 * from its canonical type.
 */
import { z } from "zod";
import {
  EVENT_TYPES,
  type AlertListItem,
  type CatalystEvent,
  type Company,
  type Drug,
  type EventCard,
  type EventType,
  type MarketReaction,
  type Outcome,
  type Paginated,
  type ReviewStatus,
  type Security,
  type SourceRecord,
  type Trial,
  type TrialPhase,
  type TrialStatus,
  type WatchlistEntityType,
  type WatchlistItem,
} from "@biocatalyst/types";

/* ---------- primitives ---------- */

const uuidOrId = z.string().min(1);
const isoDate = z.string().min(1);

export const authUserSchema = z.object({
  id: uuidOrId,
  email: z.string().min(1),
  displayName: z.string().nullable(),
  createdAt: isoDate,
});
export type AuthUserProfile = z.infer<typeof authUserSchema>;

const securitySchema = z.object({
  exchange: z.enum(["NSE", "BSE", "NYSE", "NASDAQ", "LSE", "EPA", "XETRA", "SWX", "TSE", "AMS", "EBR", "HKEX"]),
  ticker: z.string(),
  currency: z.enum(["INR", "USD", "CHF", "EUR", "GBP", "JPY", "HKD"]),
  isin: z.string().optional(),
});

const sourceRecordSchema = z.object({
  id: uuidOrId,
  title: z.string(),
  publisher: z.string(),
  url: z.string(),
  publishedAt: isoDate,
  retrievedAt: isoDate,
  isPrimary: z.boolean(),
});

const marketReactionSchema = z.object({
  windowDefinition: z.string(),
  windowStart: z.string().nullable(),
  windowEnd: z.string().nullable(),
  securityTicker: z.string(),
  exchange: z.enum(["NSE", "BSE", "NYSE", "NASDAQ", "LSE", "EPA", "XETRA", "SWX", "TSE", "AMS", "EBR", "HKEX"]),
  priceBefore: z.number().nullable(),
  priceAfter: z.number().nullable(),
  pctChange: z.number().nullable(),
  benchmarkName: z.string().optional(),
  benchmarkPctChange: z.number().nullable().optional(),
  relativeChange: z.number().nullable().optional(),
  provider: z.string(),
  licenseMetadata: z.string().optional(),
});

/* ---------- events ---------- */

const trialPhaseSchema = z.enum([
  "Phase 1",
  "Phase 1/2",
  "Phase 2",
  "Phase 2/3",
  "Phase 3",
  "Phase 4",
  "Preclinical",
]);

const eventCardSchema = z.object({
  id: uuidOrId,
  headline: z.string(),
  occurredAt: isoDate,
  eventType: z.enum(EVENT_TYPES),
  company: z.object({ id: z.string(), slug: z.string(), name: z.string(), ticker: z.string(), exchange: z.string() }).optional(),
  drug: z.object({ name: z.string() }).optional(),
  trial: z.object({ id: z.string(), phase: trialPhaseSchema }).optional(),
  indication: z.string().optional(),
  fact: z.string(),
  summary: z.string(),
  catalystSummary: z.string(),
  marketReaction: marketReactionSchema.optional(),
  sources: z.array(z.object({ title: z.string(), url: z.string(), isPrimary: z.boolean() })),
  confidence: z.number(),
});

export const paginatedEventsSchema = z.object({
  items: z.array(eventCardSchema),
  nextCursor: z.string().nullable(),
});

export const catalystEventSchema = z.object({
  id: uuidOrId,
  eventType: z.enum(EVENT_TYPES),
  occurredAt: isoDate,
  publishedAt: isoDate,
  headline: z.string(),
  fact: z.string(),
  summary: z.string(),
  catalystSummary: z.string(),
  confidence: z.number(),
  reviewStatus: z.enum(["published", "pending_review", "rejected"]),
  companyIds: z.array(z.string()),
  drugIds: z.array(z.string()),
  trialIds: z.array(z.string()),
  indication: z.string().optional(),
  phase: trialPhaseSchema.optional(),
  outcome: z.enum(["primary_endpoint_met", "primary_endpoint_missed", "unknown"]).optional(),
  sources: z.array(sourceRecordSchema),
  marketReaction: marketReactionSchema.optional(),
});

/* ---------- entities ---------- */

const companySchema = z.object({
  id: uuidOrId,
  slug: z.string(),
  canonicalName: z.string(),
  description: z.string(),
  country: z.string(),
  website: z.string(),
  aliases: z.array(z.string()),
  securities: z.array(securitySchema),
  globalFootprint: z.string().optional(),
});

const entityRefSchema = z.object({
  id: uuidOrId,
  slug: z.string(),
  canonicalName: z.string(),
});

const trialRefSchema = z.object({
  id: uuidOrId,
  registry: z.string(),
  registryTrialId: z.string(),
  phase: trialPhaseSchema,
  status: z.string(),
});

export const companyDetailSchema = companySchema.extend({
  drugs: z.array(entityRefSchema),
  trials: z.array(trialRefSchema),
});
export type CompanyDetail = z.infer<typeof companyDetailSchema>;

const drugCompanyLinkSchema = z.object({
  companyId: z.string(),
  relationshipType: z.enum(["sponsor", "originator", "licensee", "manufacturer", "marketer"]),
});

const drugSchema = z.object({
  id: uuidOrId,
  slug: z.string(),
  canonicalName: z.string(),
  aliases: z.array(z.string()),
  modality: z.string().optional(),
  mechanism: z.string().optional(),
  indications: z.array(z.string()),
  companyLinks: z.array(drugCompanyLinkSchema),
});

export const drugDetailSchema = drugSchema.extend({
  companies: z.array(entityRefSchema),
  trials: z.array(trialRefSchema),
});
export type DrugDetail = z.infer<typeof drugDetailSchema>;

export const trialSchema = z.object({
  id: uuidOrId,
  registry: z.enum(["CTRI", "ClinicalTrials.gov"]),
  registryTrialId: z.string(),
  title: z.string(),
  phase: trialPhaseSchema,
  status: z.enum([
    "Not yet recruiting",
    "Recruiting",
    "Active, not recruiting",
    "Completed",
    "Terminated",
    "Suspended",
    "Withdrawn",
  ]),
  enrollment: z.number().optional(),
  sponsorCompanyId: z.string().optional(),
  startDate: z.string().optional(),
  primaryCompletionDate: z.string().optional(),
  sourceUrl: z.string(),
  drugIds: z.array(z.string()),
  indications: z.array(z.string()),
  primaryEndpoints: z.array(z.string()).optional(),
});
export type TrialDetail = z.infer<typeof trialSchema>;

export const companyEventsSchema = z.object({
  company: entityRefSchema,
  items: z.array(eventCardSchema),
});

/* ---------- search ---------- */

export const searchResultsSchema = z.object({
  companies: z.array(entityRefSchema),
  drugs: z.array(entityRefSchema),
  trials: z.array(
    z.object({
      id: uuidOrId,
      registry: z.string(),
      registryTrialId: z.string(),
      title: z.string(),
    }),
  ),
  events: z.array(z.object({ id: uuidOrId, headline: z.string(), occurredAt: isoDate })),
});
export type SearchResults = z.infer<typeof searchResultsSchema>;

/* ---------- quote ---------- */

export const quoteSchema = z.object({
  ticker: z.string(),
  exchange: z.string(),
  currency: z.string(),
  /** Latest close; null when no market data is available. */
  price: z.number().nullable(),
  /** Previous trading day's close; null when unavailable. */
  previousClose: z.number().nullable(),
  /** Day change in percent vs previous close; null when unavailable. */
  changePct: z.number().nullable(),
  /** Trading date (YYYY-MM-DD) of `price`; null when unavailable. */
  asOf: z.string().nullable(),
  /** True when the quote comes from a delayed feed. */
  delayed: z.boolean(),
});
export type Quote = z.infer<typeof quoteSchema>;

export const priceHistorySchema = z.object({
  ticker: z.string(),
  exchange: z.string(),
  currency: z.string(),
  delayed: z.boolean(),
  provider: z.string(),
  bars: z.array(z.object({
    date: z.string(),
    close: z.number(),
    open: z.number().optional(),
    high: z.number().optional(),
    low: z.number().optional(),
    volume: z.number().optional(),
  })),
  events: z.array(z.object({
    id: z.string(),
    date: z.string(),
    eventType: z.enum(EVENT_TYPES),
    headline: z.string(),
  })),
});
export type PriceHistoryResponse = z.infer<typeof priceHistorySchema>;

export const insightsSchema = z.object({
  generatedAt: z.string(),
  activity: z.array(z.object({ eventType: z.enum(EVENT_TYPES), count: z.number() })),
  pipeline: z.array(z.object({ phase: z.string(), count: z.number() })),
  patentCliff: z.array(z.object({ year: z.number(), count: z.number() })),
  regulatorySignals: z.object({
    approvals: z.number(),
    safety: z.number(),
    manufacturing: z.number(),
    shortages: z.number(),
  }),
  upcoming: z.array(z.object({
    kind: z.enum(["trial", "patent"]),
    date: z.string(),
    title: z.string(),
    detail: z.string(),
    company: z.object({ slug: z.string(), canonicalName: z.string() }).nullable(),
  })),
});
export type InsightsResponse = z.infer<typeof insightsSchema>;

/* ---------- companies directory ---------- */

export const companyListItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  canonicalName: z.string(),
  description: z.string(),
  country: z.string(),
  website: z.string(),
  securities: z.array(
    z.object({
      exchange: z.string(),
      ticker: z.string(),
      currency: z.string(),
    }),
  ),
});
export type CompanyListItem = z.infer<typeof companyListItemSchema>;

export const companyListResponseSchema = z.object({
  items: z.array(companyListItemSchema),
  total: z.number().optional(),
  nextCursor: z.string().nullable().optional(),
});
export type CompanyListResponse = z.infer<typeof companyListResponseSchema>;

/* ---------- unified catalyst calendar ---------- */

export const calendarResponseSchema = z.object({
  generatedAt: isoDate,
  items: z.array(z.object({
    id: z.string(),
    kind: z.string(),
    date: isoDate,
    title: z.string(),
    detail: z.string(),
    status: z.enum(["confirmed", "estimated", "completed", "cancelled"]),
    sourceUrl: z.string(),
    country: z.string().nullable(),
    company: z.object({ slug: z.string(), canonicalName: z.string() }).nullable(),
  })),
});
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;

/* ---------- global links ---------- */

export const globalLinkSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  description: z.string(),
  otherCompany: z
    .object({
      slug: z.string(),
      canonicalName: z.string(),
      country: z.string(),
    })
    .nullable(),
});
export type GlobalLinkItem = z.infer<typeof globalLinkSchema>;

export const globalLinksResponseSchema = z.object({
  items: z.array(globalLinkSchema),
});
export type GlobalLinksResponse = z.infer<typeof globalLinksResponseSchema>;

/* ---------- IPO pipeline ---------- */

export const ipoStatusSchema = z.enum(["in_pipeline", "listed", "watchlist"]);
export type IpoStatus = z.infer<typeof ipoStatusSchema>;

export const ipoEntrySchema = z.object({
  company: z.object({
    id: z.string(),
    slug: z.string(),
    canonicalName: z.string(),
    description: z.string(),
    country: z.string(),
  }),
  status: ipoStatusSchema,
  milestone: z.object({
    drhpDate: z.string().optional(),
    listingDate: z.string().optional(),
    note: z.string().optional(),
  }),
  latestEvent: z
    .object({
      id: z.string(),
      headline: z.string(),
      occurredAt: z.string(),
      eventType: z.string(),
    })
    .nullable(),
});
export type IpoEntry = z.infer<typeof ipoEntrySchema>;

export const ipoResponseSchema = z.object({
  items: z.array(ipoEntrySchema),
});
export type IpoResponse = z.infer<typeof ipoResponseSchema>;

/* ---------- patents ---------- */

export const patentSchema = z.object({
  patentNumber: z.string(),
  applNo: z.string(),
  productNo: z.string(),
  tradeName: z.string(),
  applicant: z.string(),
  activeIngredient: z.string(),
  expiryDate: z.string().nullable(),
  drugSubstanceFlag: z.boolean(),
  drugProductFlag: z.boolean(),
  delisted: z.boolean(),
});
export type PatentItem = z.infer<typeof patentSchema>;

export const patentExpirySchema = patentSchema.extend({
  daysToExpiry: z.number().nullable(),
  company: z
    .object({ slug: z.string(), canonicalName: z.string().nullable() })
    .nullable(),
});
export type PatentExpiryItem = z.infer<typeof patentExpirySchema>;

export const patentStatsSchema = z.object({
  total: z.number(),
  withExpiry: z.number(),
  delisted: z.number(),
  expiringWithinYear: z.number(),
  resolvedCompanies: z.number(),
});
export type PatentStats = z.infer<typeof patentStatsSchema>;

export const patentExpiryResponseSchema = z.object({
  stats: patentStatsSchema,
  items: z.array(patentExpirySchema),
});
export type PatentExpiryResponse = z.infer<typeof patentExpiryResponseSchema>;

export const companyPatentsResponseSchema = z.object({
  items: z.array(patentSchema),
});
export type CompanyPatentsResponse = z.infer<typeof companyPatentsResponseSchema>;

/* ---------- watchlist & alerts ---------- */

const watchlistItemSchema = z.object({
  entityType: z.enum(["company", "drug"]),
  entityId: uuidOrId,
  createdAt: isoDate,
  name: z.string().nullable().optional(),
  href: z.string().nullable().optional(),
});

export const watchlistResponseSchema = z.object({
  items: z.array(watchlistItemSchema),
});
export type WatchlistResponse = z.infer<typeof watchlistResponseSchema>;

export const monitorRuleSchema = z.object({
  id: uuidOrId,
  name: z.string(),
  keyword: z.string().nullable(),
  eventTypes: z.array(z.string()),
  countries: z.array(z.string()),
  indications: z.array(z.string()),
  phases: z.array(z.string()),
  enabled: z.boolean(),
  createdAt: isoDate,
});
export type MonitorRule = z.infer<typeof monitorRuleSchema>;
export const monitorListResponseSchema = z.object({ items: z.array(monitorRuleSchema) });
export type MonitorListResponse = z.infer<typeof monitorListResponseSchema>;

export const eventStateSchema = z.object({
  saved: z.boolean(),
  note: z.string(),
  firstReadAt: z.string().nullable(),
  lastReadAt: z.string().nullable(),
});
export type EventState = z.infer<typeof eventStateSchema>;

export const libraryResponseSchema = z.object({
  items: z.array(z.object({
    id: z.string(), headline: z.string(), eventType: z.string(), occurredAt: isoDate,
    savedAt: z.string().nullable(), lastReadAt: z.string().nullable(), note: z.string(),
  })),
});
export type LibraryResponse = z.infer<typeof libraryResponseSchema>;

export const watchlistCreateResponseSchema = watchlistItemSchema.extend({
  alreadyFollowed: z.boolean().optional(),
});

const alertListItemSchema = z.object({
  id: uuidOrId,
  eventId: z.string(),
  channel: z.string(),
  status: z.string(),
  readAt: z.string().nullable(),
  createdAt: isoDate,
  headline: z.string().nullable(),
  eventType: z.string().nullable(),
  href: z.string(),
});

export const alertListResponseSchema = z.object({
  items: z.array(alertListItemSchema),
  unreadCount: z.number(),
});
export type AlertListResponse = z.infer<typeof alertListResponseSchema>;

/* ---------- misc ---------- */

export const healthSchema = z.object({
  status: z.string(),
  service: z.string().optional(),
  milestone: z.number().optional(),
});

export const sessionResponseSchema = z.object({
  user: authUserSchema.nullable(),
});

export const okResponseSchema = z.object({
  ok: z.boolean(),
  marked: z.number().optional(),
});

export const signInResponseSchema = z.object({
  user: authUserSchema,
});

/* ---------- compile-time drift guards ---------- */
/* Each assertion fails the build if the schema output ever stops matching
   the canonical type from @biocatalyst/types. */

const _checkSecurity: Security = null as unknown as z.infer<typeof securitySchema>;
const _checkSource: SourceRecord = null as unknown as z.infer<typeof sourceRecordSchema>;
const _checkReaction: MarketReaction = null as unknown as z.infer<typeof marketReactionSchema>;
const _checkEventCard: EventCard = null as unknown as z.infer<typeof eventCardSchema>;
const _checkPaginated: Paginated<EventCard> = null as unknown as z.infer<
  typeof paginatedEventsSchema
>;
const _checkEvent: CatalystEvent = null as unknown as z.infer<typeof catalystEventSchema>;
const _checkCompany: Company = null as unknown as z.infer<typeof companySchema>;
const _checkDrug: Drug = null as unknown as z.infer<typeof drugSchema>;
const _checkTrial: Trial = null as unknown as z.infer<typeof trialSchema>;
const _checkWatchlist: WatchlistItem = null as unknown as z.infer<typeof watchlistItemSchema>;
const _checkAlert: AlertListItem = null as unknown as z.infer<typeof alertListItemSchema>;

void _checkSecurity;
void _checkSource;
void _checkReaction;
void _checkEventCard;
void _checkPaginated;
void _checkEvent;
void _checkCompany;
void _checkDrug;
void _checkTrial;
void _checkWatchlist;
void _checkAlert;

// Unused-type imports referenced only to keep the drift-guard list honest.
export type {
  EventType,
  Outcome,
  ReviewStatus,
  TrialPhase,
  TrialStatus,
  WatchlistEntityType,
};
