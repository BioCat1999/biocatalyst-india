import type { Trial } from "@biocatalyst/types";

/**
 * URL for a trial detail page.
 *
 * Registry trial IDs contain slashes (e.g. "CTRI/2024/08/071902"), so the ID
 * is percent-encoded to keep it inside a single path segment of
 * /trials/[registry]/[trialId]. The page and API route decode it back with
 * decodeURIComponent before lookup.
 */
export function trialUrl(trial: Pick<Trial, "registry" | "registryTrialId">): string {
  return `/trials/${encodeURIComponent(trial.registry)}/${encodeURIComponent(trial.registryTrialId)}`;
}
