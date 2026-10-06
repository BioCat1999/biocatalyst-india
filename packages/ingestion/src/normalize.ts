/**
 * Normalization helpers shared by source adapters (Milestone 3).
 *
 * Principles (spec §7, §8.1, §17):
 *  - Deterministic: same input → same output, no model calls.
 *  - Unknown stays null: helpers return null rather than guessing when a
 *    value cannot be mapped to the closed taxonomy.
 *  - Headlines/summaries are generated from templates (spec §8.1:
 *    "Generate headlines and standard card text from templates whenever
 *    structured facts are sufficient").
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { EVENT_TYPES } from "@biocatalyst/types";
import type { NormalizedCandidate } from "./adapter.js";

/** Recursively key-sorted JSON so hashing is field-order independent. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** SHA-256 hex of the canonicalized payload — the content-hash dedupe key. */
export function contentHash(raw: unknown): string {
  return createHash("sha256").update(stableStringify(raw)).digest("hex");
}

/**
 * Canonicalize a URL for dedupe (spec §7: dedupe on canonical URL).
 * Lowercases host, drops default ports, removes tracking query params
 * (utm_*), drops the fragment, sorts remaining query params.
 */
export function canonicalizeUrl(url: string): string {
  const u = new URL(url);
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) {
    u.port = "";
  }
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !k.toLowerCase().startsWith("utm_"))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = "";
  for (const [k, v] of params) u.searchParams.append(k, v);
  u.hash = "";
  return u.toString();
}

/**
 * Event-level fingerprint (spec §7). Stable for the same underlying event,
 * distinct across events: source + taxonomy type + occurred date + the
 * trial registry id (or linked entity names when no trial).
 */
export function eventFingerprint(parts: {
  sourceName: string;
  eventType: string;
  occurredDate: string; // YYYY-MM-DD
  trialKey?: string;
  entityKey?: string;
}): string {
  const key = [parts.sourceName, parts.eventType, parts.occurredDate, parts.trialKey ?? "", parts.entityKey ?? ""].join("|");
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Cross-source dedupe key (Milestone 7). Like the event fingerprint but
 * deliberately SOURCE-AGNOSTIC and trial-anchored: the same registry trial
 * readout described by two sources (e.g. an exchange announcement and a
 * journal publication) shares one key, so the runner merges them into a
 * single event instead of creating duplicates.
 *
 * Conservative by design: only adapters that can anchor a candidate to a
 * canonical trial registry ID set it. Trial refs that fail entity
 * resolution never reach the merge step (the runner rejects unresolvable
 * candidates first), so a key can only ever point at a real canonical
 * trial. Stored on `events.cross_source_key` (partial unique index).
 */
export function crossSourceKey(parts: { registry: string; registryTrialId: string }): string {
  return createHash("sha256")
    .update(`cross-source|${parts.registry}|${parts.registryTrialId}`)
    .digest("hex");
}

/** Text or null — never an empty/whitespace string. */
export function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

/**
 * Strict ISO-8601 → ISO string, or null when the input is missing or
 * unparseable. Unknown stays null (spec §17).
 */
export function parseIso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** YYYY-MM-DD portion of an ISO string, for fingerprinting. */
export function isoDatePart(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Runtime gate for normalized candidates before they touch the database.
 * A candidate that cannot fill event_type or occurred_at is rejected by the
 * runner — never published with guessed values.
 */
export const normalizedCandidateSchema = z.object({
  sourceName: z.string().min(1),
  canonicalUrl: z.string().url(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  retrievedAt: z.string().datetime({ offset: true }),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  eventType: z.enum(EVENT_TYPES),
  occurredAt: z.string().datetime({ offset: true }),
  headline: z.string().min(1).max(500),
  factualSummary: z.string().min(1),
  catalystSummary: z.string().min(1),
  confidence: z.number().min(0).max(1),
  indication: z.string().nullable(),
  phase: z.string().nullable(),
  outcome: z.string().nullable(),
  trialRefs: z.array(z.object({ registry: z.string().min(1), registryTrialId: z.string().min(1) })),
  companyNames: z.array(z.string()),
  drugNames: z.array(z.string()),
  sourceTitle: z.string().min(1),
  publisher: z.string().min(1),
  isPrimary: z.boolean(),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * Deterministic template confidence for registry-record extraction:
 * every field comes straight from structured record fields (no model
 * inference), so 0.9 with the remaining 0.1 reserved for human review of
 * the auto-generated prose. Documented, not tuned.
 */
export const TEMPLATE_CONFIDENCE = 0.9;

/** A candidate that passed the runtime gate — event_type/occurred_at non-null. */
export type PublishableCandidate = NormalizedCandidate & {
  eventType: string;
  occurredAt: string;
};

/**
 * Runtime gate for normalized candidates before they touch the database.
 * A candidate that cannot fill event_type or occurred_at is rejected by the
 * runner — never published with guessed values. Returns the ORIGINAL
 * candidate (including its raw snapshot) on success.
 */
export function isPublishableCandidate(c: NormalizedCandidate): c is PublishableCandidate {
  if (!c.eventType || !c.occurredAt) return false;
  return normalizedCandidateSchema.safeParse(c).success;
}
