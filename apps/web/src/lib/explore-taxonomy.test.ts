import { describe, expect, it } from "vitest";
import {
  THERAPEUTIC_AREAS,
  MODALITY_GROUPS,
  getTherapeuticArea,
  getModalityGroup,
} from "./explore-taxonomy.js";

// Every indication name used in the seed (packages/data seed.ts) must belong
// to exactly one therapeutic area, so no drug/trial/event is orphaned from
// the explorer.
const SEED_INDICATIONS = [
  "Asthma",
  "Atopic dermatitis",
  "Bone metastases",
  "COPD",
  "Diabetic dyslipidemia",
  "Gastric cancer",
  "HER2-positive breast cancer",
  "Multiple myeloma",
  "Myelodysplastic syndromes",
  "NASH",
  "Obesity",
  "Oncology (partner program)",
  "Osteoporosis",
  "Plaque psoriasis",
  "Primary biliary cholangitis",
  "Psoriatic arthritis",
  "Rheumatoid arthritis",
  "Treatment-resistant depression",
  "Type 1 diabetes",
  "Type 2 diabetes",
  "Vaccine-preventable infectious disease",
];

// Every modality string used in the seed must belong to exactly one group.
const SEED_MODALITIES = [
  "API / intermediate",
  "Biosimilar fusion protein",
  "Biosimilar insulin",
  "Biosimilar monoclonal antibody",
  "Complex generic (inhalation)",
  "Complex generic (nebuliser solution)",
  "Complex generic (respiratory)",
  "Fixed-dose combination (oral)",
  "Generic small molecule (oral)",
  "Monoclonal antibody",
  "Small molecule (NCE)",
  "Small molecule",
  "Topical small molecule",
  "Vaccine (recombinant protein)",
];

describe("explore taxonomy", () => {
  it("homes every seed indication in exactly one therapeutic area", () => {
    const counts = new Map<string, number>();
    for (const area of THERAPEUTIC_AREAS) {
      for (const ind of area.indications) {
        counts.set(ind, (counts.get(ind) ?? 0) + 1);
      }
    }
    for (const ind of SEED_INDICATIONS) {
      expect(counts.get(ind), `indication "${ind}"`).toBe(1);
    }
    // No area references an indication outside the known set.
    for (const [ind] of counts) {
      expect(SEED_INDICATIONS, `unknown indication "${ind}"`).toContain(ind);
    }
  });

  it("homes every seed modality in exactly one group", () => {
    const counts = new Map<string, number>();
    for (const g of MODALITY_GROUPS) {
      for (const m of g.modalities) {
        counts.set(m, (counts.get(m) ?? 0) + 1);
      }
    }
    for (const m of SEED_MODALITIES) {
      expect(counts.get(m), `modality "${m}"`).toBe(1);
    }
  });

  it("gives every area and group at least one member", () => {
    for (const a of THERAPEUTIC_AREAS) {
      expect(a.indications.length, a.id).toBeGreaterThan(0);
    }
    for (const g of MODALITY_GROUPS) {
      expect(g.modalities.length, g.id).toBeGreaterThan(0);
    }
  });

  it("looks up areas and groups by id", () => {
    expect(getTherapeuticArea("oncology")?.label).toBe("Oncology");
    expect(getTherapeuticArea("nope")).toBeUndefined();
    expect(getModalityGroup("biologics")?.label).toBe("Biologics & biosimilars");
    expect(getModalityGroup("nope")).toBeUndefined();
  });
});
