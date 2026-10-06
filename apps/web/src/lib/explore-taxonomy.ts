/**
 * Explore taxonomy for the /explore hub — browse by disease area or by drug
 * modality instead of searching.
 *
 * Therapeutic areas group the indication names used across drugs, trials and
 * events (see packages/data seed.ts); every indication belongs to exactly
 * one area. Modality groups collect the `modality` strings present on drugs.
 * Both lists are curated here (no schema migration); the pages resolve them
 * against live DB data, so newly ingested drugs/trials/events appear
 * automatically when their indication or modality matches.
 */
export interface TherapeuticArea {
  id: string;
  label: string;
  blurb: string;
  indications: string[];
}

export const THERAPEUTIC_AREAS: TherapeuticArea[] = [
  {
    id: "oncology",
    label: "Oncology",
    blurb: "Cancers — breast, gastric, multiple myeloma and more.",
    indications: [
      "HER2-positive breast cancer",
      "Gastric cancer",
      "Multiple myeloma",
      "Myelodysplastic syndromes",
      "Bone metastases",
      "Oncology (partner program)",
    ],
  },
  {
    id: "metabolic",
    label: "Diabetes, obesity & metabolic",
    blurb: "Diabetes, obesity, dyslipidemia and liver disease.",
    indications: [
      "Type 1 diabetes",
      "Type 2 diabetes",
      "Obesity",
      "Diabetic dyslipidemia",
      "NASH",
      "Primary biliary cholangitis",
    ],
  },
  {
    id: "respiratory",
    label: "Respiratory",
    blurb: "COPD, asthma and inhaled therapies.",
    indications: ["COPD", "Asthma"],
  },
  {
    id: "immunology",
    label: "Autoimmune & inflammation",
    blurb: "Arthritis, psoriasis and dermatitis.",
    indications: [
      "Rheumatoid arthritis",
      "Plaque psoriasis",
      "Psoriatic arthritis",
      "Atopic dermatitis",
    ],
  },
  {
    id: "bone",
    label: "Bone health",
    blurb: "Osteoporosis and bone disorders.",
    indications: ["Osteoporosis"],
  },
  {
    id: "cns",
    label: "Brain & mental health",
    blurb: "Depression and CNS disorders.",
    indications: ["Treatment-resistant depression"],
  },
  {
    id: "vaccines",
    label: "Vaccines & infectious disease",
    blurb: "Vaccines and infectious disease.",
    indications: ["Vaccine-preventable infectious disease"],
  },
];

export interface ModalityGroup {
  id: string;
  label: string;
  blurb: string;
  modalities: string[];
}

export const MODALITY_GROUPS: ModalityGroup[] = [
  {
    id: "biologics",
    label: "Biologics & biosimilars",
    blurb: "Antibodies, insulins and other biologic copies.",
    modalities: [
      "Monoclonal antibody",
      "Biosimilar monoclonal antibody",
      "Biosimilar insulin",
      "Biosimilar fusion protein",
    ],
  },
  {
    id: "small-molecule",
    label: "Small molecules",
    blurb: "Oral and topical small-molecule drugs, novel and generic.",
    modalities: [
      "Small molecule",
      "Small molecule (NCE)",
      "Generic small molecule (oral)",
      "Topical small molecule",
      "Fixed-dose combination (oral)",
    ],
  },
  {
    id: "complex-generics",
    label: "Complex generics",
    blurb: "Inhalation and other hard-to-copy generics.",
    modalities: [
      "Complex generic (inhalation)",
      "Complex generic (nebuliser solution)",
      "Complex generic (respiratory)",
    ],
  },
  {
    id: "vaccines-modality",
    label: "Vaccines",
    blurb: "Recombinant and other vaccine modalities.",
    modalities: ["Vaccine (recombinant protein)"],
  },
  {
    id: "api",
    label: "APIs & intermediates",
    blurb: "Active ingredients and intermediates for innovators.",
    modalities: ["API / intermediate"],
  },
];

/** Find a therapeutic area by id; undefined when unknown. */
export function getTherapeuticArea(id: string): TherapeuticArea | undefined {
  return THERAPEUTIC_AREAS.find((a) => a.id === id);
}

/** Find a modality group by id; undefined when unknown. */
export function getModalityGroup(id: string): ModalityGroup | undefined {
  return MODALITY_GROUPS.find((g) => g.id === id);
}

/**
 * Global pharma majors active in each therapeutic area (curated, by company
 * slug). Powers the "Global players" section on explore pages — the
 * international slice of each category the user asked for.
 */
export const AREA_GLOBAL_PLAYERS: Record<string, string[]> = {
  oncology: [
    "pfizer",
    "merck-co",
    "bristol-myers-squibb",
    "roche",
    "astrazeneca",
    "novartis",
    "amgen",
    "abbvie",
    "takeda",
    "gilead",
  ],
  metabolic: ["novo-nordisk", "eli-lilly", "sanofi"],
  respiratory: ["astrazeneca", "gsk", "sanofi"],
  immunology: [
    "abbvie",
    "johnson-johnson",
    "novartis",
    "amgen",
    "sanofi",
    "pfizer",
    "eli-lilly",
  ],
  bone: ["amgen"],
  cns: ["biogen", "roche", "novartis", "eli-lilly", "johnson-johnson"],
  vaccines: ["pfizer", "gsk", "merck-co", "moderna", "sanofi", "astrazeneca"],
};

/** Global pharma majors relevant to each modality group (curated). */
export const MODALITY_GLOBAL_PLAYERS: Record<string, string[]> = {
  biologics: [
    "amgen",
    "roche",
    "abbvie",
    "johnson-johnson",
    "novartis",
    "sanofi",
    "eli-lilly",
    "bristol-myers-squibb",
    "pfizer",
    "astrazeneca",
    "gilead",
    "moderna",
    "biogen",
    "merck-co",
  ],
  "small-molecule": [
    "pfizer",
    "novartis",
    "bayer",
    "takeda",
    "bristol-myers-squibb",
    "astrazeneca",
  ],
  "complex-generics": ["sandoz"],
  "vaccines-modality": ["pfizer", "gsk", "merck-co", "moderna", "sanofi", "astrazeneca"],
  api: ["sandoz"],
};
