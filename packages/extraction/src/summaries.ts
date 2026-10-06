/**
 * Deterministic summary generation from structured facts (Milestone 4,
 * spec §8.1: "Generate headlines and standard card text from templates
 * whenever structured facts are sufficient").
 *
 * - `buildFactualSummary`: 80–150 words, assembled only from extracted
 *   facts + source metadata. No value may appear here that is not in the
 *   extraction output or the document metadata.
 * - `buildCatalystSummary`: neutral operational relevance (spec §6). It
 *   explains what the event means operationally ("may support a future
 *   regulatory submission"); it NEVER contains investment language.
 *
 * `INVESTMENT_PHRASES` is exported so tests can assert the ban.
 */
import type { StructuredExtraction } from "./schema.js";

/**
 * Word/phrase fragments that must never appear in any generated summary
 * (spec §6: catalyst summary "should explain the operational relevance of
 * the event, not predict the security").
 */
export const INVESTMENT_PHRASES = [
  "buy",
  "sell",
  "hold",
  "outperform",
  "underperform",
  "bullish",
  "bearish",
  "upside",
  "downside",
  "target price",
  "share price",
  "stock price",
  "stock should",
  "should rise",
  "should fall",
  "investment advice",
  "recommend",
  "recommendation",
  "portfolio",
  "returns",
];

export function containsInvestmentLanguage(text: string): string | null {
  const lower = ` ${text.toLowerCase()} `;
  for (const phrase of INVESTMENT_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(lower)) return phrase;
  }
  return null;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const EVENT_VERBS: Record<string, string> = {
  clinical_trial_started: "has started",
  clinical_trial_status_changed: "has reported a status update for",
  clinical_trial_result: "has reported results for",
  primary_endpoint_met: "has reported a primary-endpoint success for",
  primary_endpoint_missed: "has reported a primary-endpoint miss for",
  safety_signal: "has reported a safety signal for",
  regulatory_submission: "has made a regulatory submission for",
  regulatory_approval: "has received regulatory approval for",
  regulatory_rejection_or_deficiency: "has received a regulatory rejection or deficiency notice for",
  regulatory_committee_update: "has reported a regulatory committee update for",
  manufacturing_or_inspection_update: "has reported a manufacturing or inspection update for",
  licensing_or_partnership: "has announced a licensing or partnership event for",
  acquisition_or_divestiture: "has announced an acquisition or divestiture involving",
  scientific_publication: "has published scientific results for",
  company_pipeline_update: "has provided a pipeline update for",
};

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export interface SummaryInputs {
  extraction: StructuredExtraction;
  publisher: string;
  sourceUrlHost: string;
}

/**
 * 80–150 word factual summary built strictly from extracted facts.
 * Padding sentences are drawn from the facts list itself, so the word
 * target is met without inventing content.
 */
export function buildFactualSummary(input: SummaryInputs): string {
  const { extraction: ex, publisher } = input;
  const company = ex.company_names.length > 0 ? joinList(ex.company_names) : "the sponsor";
  const program = [
    ex.phase,
    ex.drug_names.length > 0 ? joinList(ex.drug_names) : null,
    ex.trial_ids.length > 0 ? `(${joinList(ex.trial_ids)})` : null,
    ex.indications.length > 0 ? `for ${joinList(ex.indications)}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const verb = EVENT_VERBS[ex.event_type] ?? "has reported an update for";

  const sentences: string[] = [
    `According to the ${publisher} public record, ${company} ${verb} ${program || "its program"}.`,
  ];
  if (ex.outcome === "primary_endpoint_met") {
    sentences.push("The record indicates the trial's primary endpoint was met.");
  } else if (ex.outcome === "primary_endpoint_missed") {
    sentences.push("The record indicates the trial's primary endpoint was missed.");
  } else {
    sentences.push("The record does not state whether the primary endpoint was met.");
  }
  const primaryOutcomeFact = ex.facts.find((f) => f.claim.startsWith("The stated primary outcome"));
  if (primaryOutcomeFact) sentences.push(primaryOutcomeFact.claim);
  const statusFact = ex.facts.find((f) => f.claim.startsWith("Recruitment status"));
  if (statusFact) sentences.push(statusFact.claim);
  if (ex.published_at) {
    sentences.push(`The source record was published on ${ex.published_at.slice(0, 10)}.`);
  }
  sentences.push(
    `This summary is generated from the extracted facts with an overall extraction confidence of ${Math.round(ex.confidence * 100)} percent.`,
  );
  // Pad with remaining fact claims (verbatim, factual) until the 80-word floor.
  for (const fact of ex.facts) {
    if (wordCount(sentences.join(" ")) >= 80) break;
    if (!sentences.includes(fact.claim)) sentences.push(fact.claim);
  }
  // Attribute facts to their verbatim source spans (quoted record text —
  // factual, never invented) if still below the floor.
  for (const fact of ex.facts) {
    if (wordCount(sentences.join(" ")) >= 80) break;
    const note = `Recorded as: ${fact.source_span.replace(/\.*$/, "")}.`;
    if (!sentences.includes(note)) sentences.push(note);
  }
  // Final provenance padding: describes the extraction itself, factual.
  if (wordCount(sentences.join(" ")) < 80) {
    sentences.push(
      `Provenance: extracted from the ${publisher} record (${input.sourceUrlHost}) ` +
        `with extraction confidence ${Math.round(ex.confidence * 100)} percent; ` +
        `low-confidence claims are held for manual review.`,
    );
  }
  const summary = sentences.join(" ");
  const banned = containsInvestmentLanguage(summary);
  if (banned) {
    throw new Error(`factual summary template leaked investment language: ${banned}`);
  }
  return summary;
}

/** Neutral operational-relevance summary — never investment language (spec §6). */
export function buildCatalystSummary(ex: StructuredExtraction): string {
  const base: Record<string, string> = {
    clinical_trial_started:
      "Trial initiation moves the program into clinical testing. Enrollment progress and any future data readout are the next observable milestones. This is a factual record update, not an assessment of the program.",
    clinical_trial_status_changed:
      "A recruitment-status change moves the program toward or away from a data readout. Completion of enrollment or disclosure of results is typically the next observable step.",
    clinical_trial_result:
      "Completed-trial results may support the sponsor's next regulatory step for the program. This reflects the registry record only; detailed efficacy and safety results await the underlying publication.",
    primary_endpoint_met:
      "A met primary endpoint may support the sponsor's next regulatory step for the program. This reflects the registry record only; detailed efficacy and safety results await the underlying publication.",
    primary_endpoint_missed:
      "A missed primary endpoint typically leads the sponsor to reassess the program's development plan. Any next step would appear in a future registry update or company disclosure.",
    regulatory_submission:
      "A regulatory submission starts a formal review process. The regulator's decision or further information requests are the next observable milestones.",
    regulatory_approval:
      "Regulatory approval changes the program's status from investigational to authorized in the relevant jurisdiction. Manufacturing scale-up and launch execution are the next operational steps.",
    regulatory_rejection_or_deficiency:
      "A rejection or deficiency notice typically requires the sponsor to address the regulator's questions before the program can advance.",
    regulatory_committee_update:
      "A committee update is a procedural step in the regulatory process. The committee's opinion and the subsequent decision are the next observable milestones.",
    manufacturing_or_inspection_update:
      "Manufacturing or inspection updates affect the program's supply readiness. Resolution of any observations is the next operational step.",
    licensing_or_partnership:
      "A licensing or partnership agreement changes how the program is developed or commercialized. Joint development milestones in the agreement are the next observable steps.",
    acquisition_or_divestiture:
      "A change in ownership affects who develops the program. Integration plans and any program decisions by the new owner are the next observable steps.",
    scientific_publication:
      "A scientific publication makes detailed results available for independent review. Peer discussion and any follow-up studies are the next observable steps.",
    safety_signal:
      "A safety signal typically triggers further review by the sponsor and regulators. Updated safety information would appear in future disclosures.",
    company_pipeline_update:
      "A pipeline update reflects the company's current development priorities. Future filings or registry updates would show the next operational step.",
  };
  const summary = base[ex.event_type] ?? base["company_pipeline_update"];
  const banned = containsInvestmentLanguage(summary);
  if (banned) {
    throw new Error(`catalyst summary template leaked investment language: ${banned}`);
  }
  return summary;
}
