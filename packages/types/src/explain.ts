/**
 * Plain-English explainers and importance levels for events.
 *
 * Pure and deterministic: computed at read time from the event's type,
 * headline, phase and outcome. No model call, so every stored event gets
 * one. Text explains what the event means for the drug and the company;
 * it never talks about the stock or what a reader should do (spec §6).
 */
import type { EventType, Outcome, TrialPhase } from "./index.js";

export type Importance = "high" | "medium" | "routine";

export interface EventExplainer {
  /** What happened, in one plain sentence. */
  whatHappened: string;
  /** Why a reader should care, in one or two plain sentences. */
  whyItMatters: string;
  /** The next thing to watch for, in one sentence. */
  whatNext: string;
}

export interface ExplainInput {
  eventType: EventType;
  headline: string;
  phase?: TrialPhase;
  outcome?: Outcome;
}

/* ------------------------------------------------------------------ */
/* Phase wording                                                       */
/* ------------------------------------------------------------------ */

const PHASE_MEANING: Record<TrialPhase, string> = {
  Preclinical: "lab and animal work done before any testing in people",
  "Phase 1": "the first tests in a small group of people, mainly checking safety",
  "Phase 1/2": "an early test that checks safety and takes a first look at whether the drug works",
  "Phase 2": "a mid-sized test of whether the drug works and at what dose",
  "Phase 2/3": "a combined mid- and late-stage test of whether the drug works",
  "Phase 3": "the last and largest test before a company can ask for approval",
  "Phase 4": "a study run after the drug is already on sale",
};

function isLateStage(phase?: TrialPhase): boolean {
  return phase === "Phase 3" || phase === "Phase 2/3";
}

/** "a Phase 3 trial, the last and largest test …" or a plain fallback. */
function trialPhrase(phase?: TrialPhase): string {
  return phase ? `a ${phase} trial, ${PHASE_MEANING[phase]}` : "a clinical trial, a test of a drug in people";
}

/** "a Phase 3 trial" — for sentences that already explain something else. */
function shortTrial(phase?: TrialPhase): string {
  return phase ? `a ${phase} trial` : "a clinical trial";
}

function outcomeSentence(outcome?: Outcome): string {
  if (outcome === "primary_endpoint_met") return "The company says the trial met the main goal it was designed to test.";
  if (outcome === "primary_endpoint_missed") return "The company says the trial did not meet the main goal it was designed to test.";
  return "The source does not state whether the trial met its main goal.";
}

/* ------------------------------------------------------------------ */
/* Base text per event type                                            */
/* ------------------------------------------------------------------ */

type BaseBuilder = (input: ExplainInput) => EventExplainer;

const BASE: Record<EventType, BaseBuilder> = {
  clinical_trial_started: ({ phase }) => ({
    whatHappened: `A company has started ${trialPhrase(phase)}.`,
    whyItMatters: isLateStage(phase)
      ? "Late-stage trials are expensive and are usually run only for drugs a company has high hopes for."
      : "Starting a trial moves the drug one step further, but most drugs at this stage never reach patients.",
    whatNext: "Results usually take months or years. Watch for news that the trial has finished enrolling patients.",
  }),
  clinical_trial_status_changed: ({ phase }) => ({
    whatHappened: `A public trial registry shows a status change for ${trialPhrase(phase)}.`,
    whyItMatters:
      "Status changes are usually paperwork, such as starting to enrol patients. A trial that is stopped, suspended or withdrawn is the exception worth noticing.",
    whatNext: "Watch for the trial to finish and for the company to report its results.",
  }),
  clinical_trial_result: ({ phase, outcome }) => ({
    whatHappened: `Results are out from ${trialPhrase(phase)}.`,
    whyItMatters: isLateStage(phase)
      ? `This is usually the result that decides whether a drug moves forward. ${outcomeSentence(outcome)}`
      : `Good results at this stage would earn the drug a bigger, later test. ${outcomeSentence(outcome)}`,
    whatNext: isLateStage(phase)
      ? "Watch for the full data and for the company to say whether it will file for approval."
      : "Watch for the full data and for plans for the next, larger trial.",
  }),
  primary_endpoint_met: ({ phase }) => ({
    whatHappened: `The company says ${shortTrial(phase)} met its primary endpoint, the main goal the trial was designed to test.`,
    whyItMatters: "Meeting the main goal is the clearest sign a trial worked. Side effects and the size of the benefit still matter.",
    whatNext: isLateStage(phase)
      ? "Watch for the full data and for the company to file for approval."
      : "Watch for the full data and for a larger trial to follow.",
  }),
  primary_endpoint_missed: ({ phase }) => ({
    whatHappened: `The company says ${shortTrial(phase)} did not meet its primary endpoint, the main goal the trial was designed to test.`,
    whyItMatters: "Missing the main goal is a serious setback and often ends work on the drug for this disease.",
    whatNext: "Watch for whether the company stops the program, changes the trial or looks for success in a smaller group of patients.",
  }),
  safety_signal: () => ({
    whatHappened: "A possible safety problem has been reported for a drug, such as an unexpected or serious side effect.",
    whyItMatters: "Safety problems can pause trials, add warnings to the label or, in serious cases, take a drug off the market.",
    whatNext: "Watch for the regulator or the company to say whether the drug's use will be limited or changed.",
  }),
  regulatory_submission: () => ({
    whatHappened: "A company has formally asked a regulator, such as the US FDA, to review a drug so it can be approved for sale.",
    whyItMatters: "Filing means the company believes its evidence is strong enough. Most filings are approved, though some are sent back.",
    whatNext: "A review usually takes about six months to a year. Watch for the regulator's decision date.",
  }),
  regulatory_approval: () => ({
    whatHappened: "A regulator has approved a drug, so it can now be sold for the approved use.",
    whyItMatters: "Approval is the step that lets a drug reach patients and earn money for the company.",
    whatNext: "Watch for the launch date, the price and how quickly doctors start using it.",
  }),
  regulatory_rejection_or_deficiency: () => ({
    whatHappened: "A regulator has declined to approve a drug or has found problems that must be fixed first.",
    whyItMatters: "This delays the drug, sometimes by years, and may need new studies or factory fixes.",
    whatNext: "Watch for the company's plan to answer the regulator and its expected timeline.",
  }),
  regulatory_committee_update: () => ({
    whatHappened: "An expert panel that advises a regulator has discussed or voted on a drug.",
    whyItMatters: "The regulator usually, but not always, follows its expert panel's view.",
    whatNext: "Watch for the regulator's final decision.",
  }),
  manufacturing_or_inspection_update: () => ({
    whatHappened: "There is news about a drug factory, such as a regulator inspection or a warning about how drugs are made there.",
    whyItMatters: "Problems at a factory can block new approvals and stop products made there from being shipped.",
    whatNext: "Watch for the regulator's final inspection result and any fixes the company commits to.",
  }),
  drug_shortage: () => ({
    whatHappened: "A drug has been listed as in short supply.",
    whyItMatters: "Shortages affect patients and hospitals. They often come from factory problems or demand rising faster than supply.",
    whatNext: "Watch for the shortage to be resolved or for other makers to step in.",
  }),
  securities_regulatory_action: () => ({
    whatHappened: "A market regulator, such as SEBI in India, has taken an action or made a filing involving the company.",
    whyItMatters: "These are usually about disclosures, governance or trading rules rather than the company's drugs.",
    whatNext: "Watch for any penalty, settlement or further filings.",
  }),
  licensing_or_partnership: () => ({
    whatHappened: "Two companies have agreed to work together on a drug, or one has licensed rights to it from the other.",
    whyItMatters: "Deals bring in cash or skills and show that another company sees value in the drug.",
    whatNext: "Watch for upfront payments, later milestone payments and which company runs the next trials.",
  }),
  acquisition_or_divestiture: () => ({
    whatHappened: "A company is buying, or selling off, another company, a business unit or a set of products.",
    whyItMatters: "Deals like this can change what a company makes and where its money comes from for years.",
    whatNext: "Watch for approvals from competition authorities and the date the deal closes.",
  }),
  scientific_publication: () => ({
    whatHappened: "A research paper about a drug or a disease has been published in a scientific journal.",
    whyItMatters: "Papers add evidence over time, but a single paper rarely changes a drug's prospects on its own.",
    whatNext: "Watch for follow-up studies or trial results that build on this work.",
  }),
  company_pipeline_update: () => ({
    whatHappened: "A company has shared news about the drugs it is developing, its research or its plans.",
    whyItMatters: "Updates like this show where a company is putting its effort, but they rarely change things on their own.",
    whatNext: "Watch for the specific trials, filings or launches the update points to.",
  }),
  ipo_filing: () => ({
    whatHappened: "A company has filed papers to list its shares on a stock exchange for the first time.",
    whyItMatters: "The filing reveals details about the company's drugs, finances and risks that were not public before.",
    whatNext: "Watch for the regulator's clearance and the listing date.",
  }),
  ipo_listing: () => ({
    whatHappened: "A company's shares have started trading on a stock exchange for the first time.",
    whyItMatters: "Listing raises money for research and means the company must now report its progress publicly.",
    whatNext: "Watch for the company's first results and updates on how it spends the money raised.",
  }),
};

/* ------------------------------------------------------------------ */
/* Headline nuance rules (first match wins)                            */
/* ------------------------------------------------------------------ */

interface NuanceRule {
  id: string;
  test: (headline: string) => boolean;
  apply: (base: EventExplainer, input: ExplainInput) => EventExplainer;
}

const has = (re: RegExp) => (h: string) => re.test(h);

const GENERIC_RE = /\b(?:anda|generics?)\b/;

function isEventDriven(h: string): boolean {
  if (/\bfinal analysis\b/.test(h)) return true;
  return /\b\d+(?:st|nd|rd|th)?\s+(?:events?|deaths?)\b/.test(h) && /\b(?:trial|study|analysis)\b/.test(h);
}

export const NUANCE_RULES: readonly NuanceRule[] = [
  {
    id: "event_driven",
    test: isEventDriven,
    apply: () => ({
      whatHappened:
        "The trial has reached a pre-set number of events, such as deaths or relapses. That is the point where its final analysis is run.",
      whyItMatters: "Reaching this number is not good or bad news by itself. It means the result that decides the trial is close.",
      whatNext: "Watch for the company to announce whether the trial met its main goal.",
    }),
  },
  {
    id: "topline",
    test: has(/\btop-?line\b/),
    apply: (b) => ({
      ...b,
      whatNext: "These are topline results, a first summary of the main result. Watch for the full data, usually at a medical meeting or in a journal.",
    }),
  },
  {
    id: "interim",
    test: has(/\binterim (?:analysis|results?|data)\b/),
    apply: (b) => ({
      ...b,
      whatHappened: "This is an interim look: an early check of the data while the trial is still running, not the final answer.",
      whatNext: "Watch for the final results when the trial finishes.",
    }),
  },
  {
    id: "crl",
    test: has(/\b(?:complete response letter|crl)\b/),
    apply: () => ({
      whatHappened:
        "The regulator has sent a complete response letter: it will not approve the drug as submitted and has said what must be fixed.",
      whyItMatters: "This delays the drug. Simple fixes can take months; new studies can take years.",
      whatNext: "Watch for the company's plan to answer the regulator and when it expects to resubmit.",
    }),
  },
  {
    id: "accelerated_approval",
    test: has(/\baccelerated approval\b/),
    apply: (b) => ({
      ...b,
      whyItMatters:
        "This is an accelerated approval, granted on early evidence. The company must still confirm the benefit in a later trial.",
      whatNext: "Watch for the confirmatory trial. If it fails, the approval can be withdrawn.",
    }),
  },
  {
    id: "expedited_designation",
    test: has(/\b(?:breakthrough therapy|fast track|priority review|orphan drug)\b/),
    apply: (b) => ({
      ...b,
      whyItMatters:
        "This is a regulator label that speeds up or supports the review of a promising drug. It is not an approval.",
      whatNext: "Watch for the drug's trial results and the company's application for approval.",
    }),
  },
  {
    id: "expert_panel",
    test: has(/\b(?:chmp|positive opinion|advisory committee)\b/),
    apply: (b) => ({
      ...b,
      whatHappened: "An expert panel that advises a regulator has given its view on a drug.",
      whyItMatters: "The regulator usually, but not always, follows its expert panel's advice.",
      whatNext: "Watch for the regulator's final decision, often within a few months.",
    }),
  },
  {
    id: "biosimilar",
    test: has(/\bbiosimilars?\b/),
    apply: (b) => ({
      ...b,
      whyItMatters:
        "A biosimilar is a near-copy of an existing biologic drug, one made from living cells. It usually costs less than the original.",
    }),
  },
  {
    id: "generic",
    test: has(GENERIC_RE),
    apply: (b, input) => {
      if (input.eventType === "regulatory_approval")
        return {
          ...b,
          whyItMatters: "This clears the company to make and market a copy of an existing drug, usually at a lower price than the original.",
          whatNext: "Watch for the launch date and how many other companies offer the same copy.",
        };
      if (input.eventType === "regulatory_submission")
        return {
          ...b,
          whyItMatters: "The company wants to market a copy of an existing drug. Copies usually cost less than the original.",
        };
      return b;
    },
  },
  {
    id: "new_indication",
    test: has(/\b(?:new indication|label expansion|expanded indication)\b/),
    apply: (b) => ({
      ...b,
      whyItMatters: "An already-approved drug has been cleared for an additional disease or group of patients, so more people can use it.",
    }),
  },
  {
    id: "recall",
    test: has(/\brecall(?:s|ed|ing)?\b/),
    apply: (b) => ({
      ...b,
      whatHappened: "The company is recalling, or pulling back, specific batches of a product from the market.",
      whyItMatters: "Recalls usually stem from a quality or safety problem and can point to issues at the factory.",
    }),
  },
  {
    id: "primary_endpoint",
    test: has(/\bprimary (?:end ?point|endpoints)\b/),
    apply: (b, input) =>
      input.eventType === "primary_endpoint_met" || input.eventType === "primary_endpoint_missed"
        ? b
        : { ...b, whatNext: "The primary endpoint is the main goal the trial was designed to test. Watch for the full data." },
  },
];

function matchNuance(headline: string): NuanceRule | undefined {
  const h = headline.toLowerCase();
  return NUANCE_RULES.find((r) => r.test(h));
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function explainEvent(input: ExplainInput): EventExplainer {
  const base = BASE[input.eventType](input);
  const rule = matchNuance(input.headline);
  return rule ? rule.apply(base, input) : base;
}

const RANK: Record<Importance, number> = { routine: 0, medium: 1, high: 2 };

function baseImportance({ eventType, phase, headline }: ExplainInput): Importance {
  switch (eventType) {
    case "primary_endpoint_met":
    case "primary_endpoint_missed":
    case "regulatory_rejection_or_deficiency":
    case "acquisition_or_divestiture":
    case "safety_signal":
      return "high";
    case "clinical_trial_result":
      return isLateStage(phase) ? "high" : "medium";
    case "regulatory_approval":
      return GENERIC_RE.test(headline.toLowerCase()) ? "medium" : "high";
    case "clinical_trial_started":
      return phase === "Phase 3" ? "medium" : "routine";
    case "regulatory_submission":
    case "regulatory_committee_update":
    case "licensing_or_partnership":
    case "manufacturing_or_inspection_update":
    case "securities_regulatory_action":
    case "ipo_filing":
    case "ipo_listing":
      return "medium";
    case "clinical_trial_status_changed":
    case "scientific_publication":
    case "company_pipeline_update":
    case "drug_shortage":
      return "routine";
  }
}

export function eventImportance(input: ExplainInput): Importance {
  const level = baseImportance(input);
  if (isEventDriven(input.headline.toLowerCase()) && RANK[level] < RANK.medium) return "medium";
  return level;
}

export function importanceLabel(i: Importance): string {
  return i === "high" ? "Major" : i === "medium" ? "Notable" : "Routine";
}
