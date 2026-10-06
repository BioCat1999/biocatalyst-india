/**
 * Runtime validation for public API inputs (spec §21: rate limiting and
 * least-privilege; Milestone 2 adds Zod validation on all API inputs).
 *
 * Query/path params are untrusted — validate before they reach the data
 * layer. Invalid input → 400 with a short error; never a 500.
 */
import { z } from "zod";
import { EVENT_TYPES } from "@biocatalyst/types";

const TRIAL_PHASES = [
  "Phase 1",
  "Phase 1/2",
  "Phase 2",
  "Phase 2/3",
  "Phase 3",
  "Phase 4",
  "Preclinical",
] as const;

const isoDateTime = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "must be ISO 8601" });

export const eventsQuerySchema = z.object({
  event_type: z.enum(EVENT_TYPES).optional(),
  company: z.string().max(100).optional(),
  phase: z.enum(TRIAL_PHASES).optional(),
  indication: z.string().max(200).optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  // Cursor is an opaque event id. An unknown/malformed cursor is NOT a 400:
  // the data layer treats it as "first page" (Milestone 1 semantics).
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
});

export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-]+$/, { message: "invalid slug" });

export const registrySchema = z.enum(["CTRI", "ClinicalTrials.gov"]);

export const trialIdSchema = z.string().min(1).max(200);

export const resolveQuerySchema = z.object({
  entity_type: z.enum(["company", "drug"]),
  entity_id: z.string().uuid(),
});

export type EventsQuery = z.infer<typeof eventsQuerySchema>;

/**
 * Auth inputs — Milestone 6 (spec §14). Email/password only; no OAuth, no
 * third-party providers (see docs/decisions.md).
 */
export const authCredentialsSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(200), // length policy enforced by the provider
});

export const watchlistCreateSchema = z.object({
  entity_type: z.enum(["company", "drug"]),
  entity_id: z.string().uuid(),
});

export const watchlistPathSchema = z.object({
  entity_type: z.enum(["company", "drug"]),
  entity_id: z.string().uuid(),
});

export const alertReadSchema = z.object({
  alert_id: z.string().uuid(),
});

/** Parse URLSearchParams against a schema; returns a 400-shaped error or data. */
export function parseQuery<T extends z.ZodTypeAny>(
  schema: T,
  params: URLSearchParams,
): { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  const obj: Record<string, string> = {};
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (seen.has(key)) continue;
    seen.add(key);
    const v = params.get(key);
    if (v !== null) obj[key] = v;
  }
  const result = schema.safeParse(obj);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      ok: false,
      error: `invalid query: ${String(first.path[0] ?? "params")} — ${first.message}`,
    };
  }
  return { ok: true, data: result.data };
}
