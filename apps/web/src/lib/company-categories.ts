/**
 * Curated company categories for the /companies browse page.
 *
 * Two kinds: broad groupings that span most of the coverage universe
 * ("Generics"), and sub-field groupings by what each company actually does
 * ("Biosimilars & biologics", "API & CDMO", …). Keyed by company slug so the
 * page stays in sync with the catalog without a schema migration; a company
 * appears under every category it belongs to.
 */
export interface CompanyCategory {
  id: string;
  label: string;
  blurb: string;
  kind: "broad" | "subfield";
}

export const COMPANY_CATEGORIES: CompanyCategory[] = [
  {
    id: "generics",
    label: "Generics",
    blurb: "Off-patent medicines — the core of India's pharma industry.",
    kind: "broad",
  },
  {
    id: "biosimilars",
    label: "Biosimilars & biologics",
    blurb: "Complex biologic copies and novel biopharma.",
    kind: "subfield",
  },
  {
    id: "api-cdmo",
    label: "API & CDMO",
    blurb: "Active ingredients and contract manufacturing for innovators.",
    kind: "subfield",
  },
  {
    id: "specialty",
    label: "Specialty & innovative",
    blurb: "Branded specialty portfolios and novel drugs.",
    kind: "subfield",
  },
  {
    id: "vaccines",
    label: "Vaccines",
    blurb: "Vaccine development and manufacturing.",
    kind: "subfield",
  },
  {
    id: "consumer-health",
    label: "Consumer health",
    blurb: "OTC and consumer-facing health brands.",
    kind: "subfield",
  },
];

const COMPANY_TO_CATEGORIES: Record<string, string[]> = {
  "sun-pharma": ["generics", "specialty"],
  "dr-reddys": ["generics", "biosimilars"],
  cipla: ["generics"],
  biocon: ["biosimilars"],
  "divis-laboratories": ["api-cdmo"],
  lupin: ["generics", "biosimilars"],
  "aurobindo-pharma": ["generics", "api-cdmo", "biosimilars"],
  "zydus-lifesciences": ["generics", "specialty", "vaccines"],
  "torrent-pharma": ["generics"],
  "mankind-pharma": ["generics", "consumer-health"],
  alkem: ["generics"],
  "ipca-labs": ["generics", "api-cdmo"],
  "glenmark-pharma": ["generics", "specialty"],
  "laurus-labs": ["api-cdmo"],
  "ajanta-pharma": ["generics"],
  "natco-pharma": ["generics", "specialty"],
  "jb-chemicals": ["generics", "consumer-health"],
  "granules-india": ["generics", "api-cdmo"],
  "piramal-pharma": ["api-cdmo"],
  "alembic-pharma": ["generics", "api-cdmo"],
  "gland-pharma": ["api-cdmo"],
  "abbott-india": ["generics", "consumer-health"],
  wockhardt: ["generics", "specialty"],
  "sai-life": ["api-cdmo"],
  "sanofi-india": ["specialty", "vaccines", "consumer-health"],
  "pfizer-india": ["specialty", "vaccines"],
  "strides-pharma": ["generics", "api-cdmo"],
  syngene: ["api-cdmo"],
  "neuland-labs": ["api-cdmo"],
  "shilpa-medicare": ["api-cdmo", "generics"],
  "krebs-biochemicals": ["api-cdmo"],
  "morepen-labs": ["api-cdmo", "consumer-health"],
  "vivimed-labs": ["api-cdmo"],
  "kilitch-drugs": ["generics"],
  "novartis-india": ["specialty"],
  "bafna-pharma": ["generics"],
  "sunil-healthcare": ["api-cdmo"],
  symbiotec: ["api-cdmo"],
  medicaps: ["api-cdmo"],
  "ind-swift-labs": ["api-cdmo"],
  "cohance-lifesciences": ["api-cdmo"],
  "aarti-pharmalabs": ["api-cdmo"],
  "medico-remedies": ["generics"],
  "ortin-global": ["api-cdmo"],
  kopran: ["generics", "api-cdmo"],
  "parnax-lab": ["generics"],
  "iol-chemicals": ["api-cdmo"],
  "aarey-drugs": ["api-cdmo"],
  "shree-ganesh-remedies": ["api-cdmo"],
  "marksans-pharma": ["generics", "consumer-health"],
  "beta-drugs": ["generics", "specialty"],
  "makers-labs": ["generics"],
  "rubicon-research": ["generics", "specialty"],
  "innova-captab": ["api-cdmo"],
  "blue-jet-healthcare": ["api-cdmo"],
  "fermenta-biotech": ["api-cdmo"],
  "ngl-finechem": ["api-cdmo"],
  "vaishali-pharma": ["generics"],
  hikal: ["api-cdmo"],
  emcure: ["generics"],
  jenburkt: ["generics"],
  "gsk-india": ["specialty", "vaccines", "consumer-health"],
  "venus-remedies": ["generics", "specialty"],
  medplus: ["consumer-health"],
  "eris-lifesciences": ["generics"],
  amrutanjan: ["consumer-health"],
  "anthem-biosciences": ["api-cdmo"],
  "alivus-life-sciences": ["api-cdmo"],
  "alpa-labs": ["generics"],
  "shukra-pharma": ["generics"],
  "sudeep-pharma": ["api-cdmo"],
  "lincoln-pharma": ["generics"],
  akums: ["api-cdmo"],
  "zim-labs": ["generics", "specialty"],
  "orchid-pharma": ["api-cdmo", "generics"],
  wanbury: ["api-cdmo"],
  "haleos-labs": ["generics"],
  "windlas-biotech": ["api-cdmo"],
  "onesource-specialty": ["api-cdmo", "biosimilars"],
  "valiant-labs": ["api-cdmo"],
  "ttk-healthcare": ["consumer-health", "generics"],
  "medicamen-biotech": ["generics"],
  fdc: ["generics", "consumer-health"],
  "sai-parenterals": ["generics"],
  "sms-pharma": ["api-cdmo"],
  "bajaj-healthcare": ["api-cdmo"],
  "solara-active-pharma": ["api-cdmo"],
  "gujarat-themis-biosyn": ["api-cdmo"],
  sparc: ["specialty"],
  "bliss-gvs": ["generics"],
  sigachi: ["api-cdmo"],
  "entero-healthcare": ["generics"],
  "viyash-scientific": ["api-cdmo"],
  "anuh-pharma": ["api-cdmo"],
  "albert-david": ["generics"],
  "brooks-labs": ["generics"],
  "panacea-biotec": ["vaccines", "biosimilars"],
  "unichem-labs": ["generics"],
  "balaxi-pharma": ["generics"],
  "lyka-labs": ["generics"],
  "supriya-lifescience": ["api-cdmo"],
  "zota-healthcare": ["generics"],
  "kwality-pharma": ["generics"],
  "par-drugs": ["api-cdmo"],
  "natural-capsules": ["api-cdmo"],
  "hester-biosciences": ["vaccines"],
  "aarti-drugs": ["api-cdmo"],
  "astrazeneca-india": ["specialty"],
  "acutaas-chemicals": ["api-cdmo"],
  jagsonpal: ["generics"],
  "nectar-lifesciences": ["api-cdmo"],
  "senores-pharma": ["generics", "specialty"],
  "advanced-enzyme": ["api-cdmo"],
  "themis-medicare": ["generics", "api-cdmo"],
  "jubilant-pharmova": ["api-cdmo", "generics"],
  "corona-remedies": ["generics"],
  "caplin-point": ["generics"],
  "gufic-bio": ["generics"],
  "vineet-labs": ["generics"],
  "bal-pharma": ["api-cdmo", "generics"],
  "rpg-life-sciences": ["generics"],
  "fredun-pharma": ["generics", "consumer-health"],
  "biofil-chemicals": ["generics"],
  "pg-health": ["consumer-health"],
  "suven-life-sciences": ["specialty"],
  "indoco-remedies": ["generics"],
  "zydus-wellness": ["consumer-health"],
  "jeena-sikho": ["consumer-health"],
  "bharat-parenterals": ["generics"],
  "ambalal-sarabhai": ["generics"],
  "syncom-formulation": ["generics"],
  "dishman-carbogen-amcis": ["api-cdmo"],
  "anlon-healthcare": ["generics"],
  "mangalam-drugs": ["api-cdmo"],
};

/**
 * Categories for the global pharma majors (Global section). Same taxonomy,
 * so global companies can appear alongside Indian ones in explore views.
 */
const GLOBAL_COMPANY_TO_CATEGORIES: Record<string, string[]> = {
  pfizer: ["specialty", "vaccines"],
  "johnson-johnson": ["specialty"],
  "merck-co": ["specialty", "vaccines"],
  "eli-lilly": ["specialty"],
  abbvie: ["specialty"],
  "bristol-myers-squibb": ["specialty"],
  amgen: ["biosimilars", "specialty"],
  gilead: ["specialty"],
  moderna: ["specialty", "vaccines"],
  biogen: ["specialty"],
  novartis: ["specialty"],
  roche: ["specialty"],
  sandoz: ["generics", "biosimilars"],
  "novo-nordisk": ["specialty"],
  astrazeneca: ["specialty", "vaccines"],
  gsk: ["specialty", "vaccines", "consumer-health"],
  sanofi: ["specialty", "vaccines", "consumer-health"],
  takeda: ["specialty"],
  bayer: ["specialty", "consumer-health"],
};

/** Categories for one company (by slug); empty when the slug is unknown. */
export function categoriesForCompany(slug: string): CompanyCategory[] {
  const ids = COMPANY_TO_CATEGORIES[slug] ?? GLOBAL_COMPANY_TO_CATEGORIES[slug] ?? [];
  const byId = new Map(COMPANY_CATEGORIES.map((c) => [c.id, c]));
  return ids.flatMap((id) => {
    const c = byId.get(id);
    return c ? [c] : [];
  });
}

/** True when the category id is a known category (or "all"). */
export function isKnownCategory(id: string): boolean {
  return id === "all" || COMPANY_CATEGORIES.some((c) => c.id === id);
}
