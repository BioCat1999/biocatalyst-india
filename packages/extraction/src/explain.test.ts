import { describe, expect, it } from "vitest";
import {
  EVENT_TYPES,
  NUANCE_RULES,
  eventImportance,
  explainEvent,
  importanceLabel,
  type EventType,
  type ExplainInput,
  type Outcome,
  type TrialPhase,
} from "@biocatalyst/types";
import { containsInvestmentLanguage, wordCount } from "./summaries.js";

const PHASES: (TrialPhase | undefined)[] = [
  undefined,
  "Preclinical",
  "Phase 1",
  "Phase 1/2",
  "Phase 2",
  "Phase 2/3",
  "Phase 3",
  "Phase 4",
];
const OUTCOMES: (Outcome | undefined)[] = [undefined, "unknown", "primary_endpoint_met", "primary_endpoint_missed"];

/** One realistic headline per nuance rule, keyed by rule id. */
const NUANCE_HEADLINES: Record<string, string> = {
  event_driven: "Trial reaches 80th event, triggering final analysis",
  topline: "Acme announces positive topline results from Phase 3 study",
  interim: "Acme reports interim analysis of ACME-301 trial",
  crl: "Acme receives Complete Response Letter from FDA for ACM-1",
  accelerated_approval: "FDA grants accelerated approval to Acmezumab",
  expedited_designation: "Acme's ACM-2 receives Breakthrough Therapy designation",
  expert_panel: "CHMP adopts positive opinion for Acmezumab",
  biosimilar: "Acme launches biosimilar of adalimumab in Europe",
  generic: "Acme receives final ANDA approval for metformin tablets",
  new_indication: "FDA approves new indication for Acmezumab in children",
  recall: "Acme recalls 12 batches of blood pressure tablets",
  primary_endpoint: "ACME-301 meets primary endpoint in heart failure",
};

function allInputs(): ExplainInput[] {
  const headlines = ["Acme Pharma update", ...Object.values(NUANCE_HEADLINES)];
  const inputs: ExplainInput[] = [];
  for (const eventType of EVENT_TYPES)
    for (const phase of PHASES)
      for (const outcome of OUTCOMES)
        for (const headline of headlines) inputs.push({ eventType, headline, phase, outcome });
  return inputs;
}

describe("explainEvent", () => {
  it("returns three non-empty lines for every event type", () => {
    for (const eventType of EVENT_TYPES) {
      const e = explainEvent({ eventType, headline: "Acme Pharma update" });
      expect(e.whatHappened.trim(), eventType).not.toBe("");
      expect(e.whyItMatters.trim(), eventType).not.toBe("");
      expect(e.whatNext.trim(), eventType).not.toBe("");
    }
  });

  it("never uses investment language and keeps each line to 30 words", () => {
    for (const input of allInputs()) {
      const e = explainEvent(input);
      for (const [field, text] of Object.entries(e)) {
        const ctx = `${input.eventType}/${input.phase}/${input.outcome}/${input.headline}/${field}`;
        expect(containsInvestmentLanguage(text), ctx).toBeNull();
        expect(wordCount(text), `${ctx}: ${text}`).toBeLessThanOrEqual(30);
      }
    }
  });

  it("does not repeat the headline", () => {
    for (const input of allInputs()) {
      const e = explainEvent(input);
      expect(Object.values(e).join(" ")).not.toContain(input.headline);
    }
  });

  it("words Phase 1 and Phase 3 differently", () => {
    const p1 = explainEvent({ eventType: "clinical_trial_result", headline: "x", phase: "Phase 1" });
    const p3 = explainEvent({ eventType: "clinical_trial_result", headline: "x", phase: "Phase 3" });
    expect(p1.whatHappened).not.toBe(p3.whatHappened);
    expect(p3.whatHappened).toContain("last and largest test");
    expect(p1.whatHappened).toContain("mainly checking safety");
  });

  it("never claims success when the outcome is unknown", () => {
    for (const outcome of [undefined, "unknown"] as const) {
      for (const phase of PHASES) {
        const e = explainEvent({ eventType: "clinical_trial_result", headline: "Acme results", phase, outcome });
        const text = Object.values(e)
          .join(" ")
          .toLowerCase()
          .replace("the source does not state whether the trial met its main goal.", "");
        expect(Object.values(e).join(" ")).toContain("does not state whether");
        expect(text).not.toMatch(/\b(met its main goal|succeeded|was successful|worked)\b/);
      }
    }
  });

  it("reports the stated outcome when it is known", () => {
    const met = explainEvent({ eventType: "clinical_trial_result", headline: "x", phase: "Phase 3", outcome: "primary_endpoint_met" });
    const missed = explainEvent({ eventType: "clinical_trial_result", headline: "x", phase: "Phase 3", outcome: "primary_endpoint_missed" });
    expect(met.whyItMatters).toContain("met the main goal");
    expect(missed.whyItMatters).toContain("did not meet");
  });

  it("explains an event-driven trial milestone as neither good nor bad news", () => {
    const e = explainEvent({
      eventType: "clinical_trial_status_changed",
      headline: "SELLAS REGAL trial reaches 80th death, triggering final analysis",
    });
    expect(e.whatHappened).toContain("pre-set number of events");
    expect(e.whyItMatters).toContain("not good or bad news");
  });

  it("covers every nuance rule with a test headline", () => {
    expect(Object.keys(NUANCE_HEADLINES).sort()).toEqual(NUANCE_RULES.map((r) => r.id).sort());
  });

  for (const rule of NUANCE_RULES) {
    it(`fires the ${rule.id} rule on a realistic headline`, () => {
      const headline = NUANCE_HEADLINES[rule.id];
      const matched = NUANCE_RULES.find((r) => r.test(headline.toLowerCase()));
      expect(matched?.id).toBe(rule.id);
    });
  }

  it("only says a generic is cleared when it was actually approved", () => {
    const headline = "Cipla submits ANDA for a triple-combination inhaler";
    const filed = explainEvent({ eventType: "regulatory_submission", headline });
    const approved = explainEvent({ eventType: "regulatory_approval", headline });
    expect(filed.whyItMatters).not.toContain("clears");
    expect(filed.whyItMatters).toContain("copy");
    expect(approved.whyItMatters).toContain("clears");
  });

  it("does not fire rules on look-alike words", () => {
    const lookalikes = [
      "Acme sets new standard of care in Uganda", // "anda" inside words
      "Acme names new chief generalist officer", // "generic" prefix
      "Acme recalibrates its research strategy", // "recall" prefix
      "Acme stocks 40 deaths-defying devices", // numbers + deaths without trial words
      "Acme's topliner sales team expands", // "topline" prefix
    ];
    for (const h of lookalikes) {
      expect(NUANCE_RULES.find((r) => r.test(h.toLowerCase()))?.id, h).toBeUndefined();
    }
  });
});

describe("eventImportance", () => {
  const imp = (eventType: EventType, extra: Partial<ExplainInput> = {}) =>
    eventImportance({ eventType, headline: "Acme update", ...extra });

  it("marks major events high", () => {
    for (const t of [
      "primary_endpoint_met",
      "primary_endpoint_missed",
      "regulatory_rejection_or_deficiency",
      "acquisition_or_divestiture",
      "safety_signal",
    ] as const)
      expect(imp(t), t).toBe("high");
    expect(imp("clinical_trial_result", { phase: "Phase 3" })).toBe("high");
    expect(imp("clinical_trial_result", { phase: "Phase 2/3" })).toBe("high");
    expect(imp("regulatory_approval", { headline: "FDA approves Acmezumab" })).toBe("high");
  });

  it("marks notable events medium", () => {
    for (const t of [
      "regulatory_submission",
      "regulatory_committee_update",
      "licensing_or_partnership",
      "manufacturing_or_inspection_update",
      "securities_regulatory_action",
      "ipo_filing",
      "ipo_listing",
    ] as const)
      expect(imp(t), t).toBe("medium");
    expect(imp("clinical_trial_result", { phase: "Phase 2" })).toBe("medium");
    expect(imp("clinical_trial_result")).toBe("medium");
    expect(imp("clinical_trial_started", { phase: "Phase 3" })).toBe("medium");
    expect(imp("regulatory_approval", { headline: "Acme receives final ANDA approval for metformin" })).toBe("medium");
    expect(imp("regulatory_approval", { headline: "Acme launches generic of Xyz" })).toBe("medium");
  });

  it("marks routine events routine", () => {
    for (const t of ["clinical_trial_status_changed", "scientific_publication", "company_pipeline_update", "drug_shortage"] as const)
      expect(imp(t), t).toBe("routine");
    expect(imp("clinical_trial_started", { phase: "Phase 1" })).toBe("routine");
    expect(imp("clinical_trial_started")).toBe("routine");
  });

  it("raises an event-driven final-analysis milestone to at least medium", () => {
    expect(imp("clinical_trial_status_changed", { headline: "Trial reaches 80th event, triggering final analysis" })).toBe("medium");
    expect(imp("safety_signal", { headline: "Trial reaches 80th event, triggering final analysis" })).toBe("high");
  });

  it("labels levels for display", () => {
    expect(importanceLabel("high")).toBe("Major");
    expect(importanceLabel("medium")).toBe("Notable");
    expect(importanceLabel("routine")).toBe("Routine");
  });
});
