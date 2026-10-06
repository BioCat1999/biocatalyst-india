/**
 * Confidence-threshold review rules — Milestone 4 (spec §8.3).
 *
 * - A "primary endpoint met/missed" label below the confidence threshold
 *   is NEVER auto-published; it goes to `pending_review` for manual review.
 * - Any extraction below the threshold (any outcome) goes to
 *   `pending_review` — unknown stays unknown rather than being published
 *   as fact.
 * - Deterministic fallback extractions always go to `pending_review`
 *   (marked low confidence).
 *
 * Above the threshold, events are auto-published. The review queue itself
 * is exposed through the data layer (`listPendingReview`) and surfaced in
 * `GET /api/v1/admin/health`.
 */
export const PUBLISH_CONFIDENCE_THRESHOLD = 0.85;

/** Confidence assigned when the deterministic fallback path is used. */
export const FALLBACK_CONFIDENCE = 0.5;

export type ReviewDecision = "published" | "pending_review";

export interface ReviewInput {
  outcome: string;
  confidence: number;
  fallbackUsed: boolean;
}

export function resolveReviewStatus(input: ReviewInput): ReviewDecision {
  if (input.fallbackUsed) return "pending_review";
  if (input.confidence < PUBLISH_CONFIDENCE_THRESHOLD) return "pending_review";
  return "published";
}
