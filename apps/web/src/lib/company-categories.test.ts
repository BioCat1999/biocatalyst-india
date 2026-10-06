import { describe, expect, it } from "vitest";
import {
  COMPANY_CATEGORIES,
  categoriesForCompany,
  isKnownCategory,
} from "./company-categories.js";

// The 134 seeded companies (packages/data seed.ts); the category map must
// cover every one of them.
const SEED_SLUGS = [
  "sun-pharma",
  "dr-reddys",
  "cipla",
  "biocon",
  "divis-laboratories",
  "lupin",
  "aurobindo-pharma",
  "zydus-lifesciences",
  "torrent-pharma",
  "mankind-pharma",
  "alkem",
  "ipca-labs",
  "glenmark-pharma",
  "laurus-labs",
  "ajanta-pharma",
  "natco-pharma",
  "jb-chemicals",
  "granules-india",
  "piramal-pharma",
  "alembic-pharma",
  "gland-pharma",
  "abbott-india",
  "wockhardt",
  "sai-life",
  "sanofi-india",
  "pfizer-india",
  "strides-pharma",
  "syngene",
  "neuland-labs",
  "shilpa-medicare",
  "krebs-biochemicals",
  "morepen-labs",
  "vivimed-labs",
  "kilitch-drugs",
  "novartis-india",
  "bafna-pharma",
  "sunil-healthcare",
  "symbiotec",
  "medicaps",
  "ind-swift-labs",
  "cohance-lifesciences",
  "aarti-pharmalabs",
  "medico-remedies",
  "ortin-global",
  "kopran",
  "parnax-lab",
  "iol-chemicals",
  "aarey-drugs",
  "shree-ganesh-remedies",
  "marksans-pharma",
  "beta-drugs",
  "makers-labs",
  "rubicon-research",
  "innova-captab",
  "blue-jet-healthcare",
  "fermenta-biotech",
  "ngl-finechem",
  "vaishali-pharma",
  "hikal",
  "emcure",
  "jenburkt",
  "gsk-india",
  "venus-remedies",
  "medplus",
  "eris-lifesciences",
  "amrutanjan",
  "anthem-biosciences",
  "alivus-life-sciences",
  "alpa-labs",
  "shukra-pharma",
  "sudeep-pharma",
  "lincoln-pharma",
  "akums",
  "zim-labs",
  "orchid-pharma",
  "wanbury",
  "haleos-labs",
  "windlas-biotech",
  "onesource-specialty",
  "valiant-labs",
  "ttk-healthcare",
  "medicamen-biotech",
  "fdc",
  "sai-parenterals",
  "sms-pharma",
  "bajaj-healthcare",
  "solara-active-pharma",
  "gujarat-themis-biosyn",
  "sparc",
  "bliss-gvs",
  "sigachi",
  "entero-healthcare",
  "viyash-scientific",
  "anuh-pharma",
  "albert-david",
  "brooks-labs",
  "panacea-biotec",
  "unichem-labs",
  "balaxi-pharma",
  "lyka-labs",
  "supriya-lifescience",
  "zota-healthcare",
  "kwality-pharma",
  "par-drugs",
  "natural-capsules",
  "hester-biosciences",
  "aarti-drugs",
  "astrazeneca-india",
  "acutaas-chemicals",
  "jagsonpal",
  "nectar-lifesciences",
  "senores-pharma",
  "advanced-enzyme",
  "themis-medicare",
  "jubilant-pharmova",
  "corona-remedies",
  "caplin-point",
  "gufic-bio",
  "vineet-labs",
  "bal-pharma",
  "rpg-life-sciences",
  "fredun-pharma",
  "biofil-chemicals",
  "pg-health",
  "suven-life-sciences",
  "indoco-remedies",
  "zydus-wellness",
  "jeena-sikho",
  "bharat-parenterals",
  "ambalal-sarabhai",
  "syncom-formulation",
  "dishman-carbogen-amcis",
  "anlon-healthcare",
  "mangalam-drugs",
];

describe("company-categories", () => {
  it("covers every seeded company with at least one category", () => {
    for (const slug of SEED_SLUGS) {
      expect(categoriesForCompany(slug).length, slug).toBeGreaterThan(0);
    }
  });

  it("references only known category ids", () => {
    const ids = new Set(COMPANY_CATEGORIES.map((c) => c.id));
    for (const slug of SEED_SLUGS) {
      for (const c of categoriesForCompany(slug)) {
        expect(ids.has(c.id)).toBe(true);
      }
    }
  });

  it("gives every category at least one company", () => {
    for (const cat of COMPANY_CATEGORIES) {
      const members = SEED_SLUGS.filter((s) =>
        categoriesForCompany(s).some((c) => c.id === cat.id),
      );
      expect(members.length, cat.id).toBeGreaterThan(0);
    }
  });

  it("returns [] for unknown slugs and recognises 'all'", () => {
    expect(categoriesForCompany("nope")).toEqual([]);
    expect(isKnownCategory("all")).toBe(true);
    expect(isKnownCategory("generics")).toBe(true);
    expect(isKnownCategory("nope")).toBe(false);
  });
});
