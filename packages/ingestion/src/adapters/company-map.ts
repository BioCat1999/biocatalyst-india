/**
 * Canonical catalog matching for LIVE source adapters (`ctgov`, `gdelt`).
 *
 * Real-world records name sponsors, publishers and drugs however they like
 * ("Biocon Biologics UK PLC", "Lipaglyn"). The ingestion runner resolves a
 * candidate's entity names against the canonical catalog with an exact,
 * case-insensitive match (`resolveNamed` in run.ts) and REJECTS candidates
 * with unresolvable names — so live adapters must emit canonical names,
 * never raw strings. This module maps observed real-world strings to the
 * canonical names seeded in `packages/data/src/seed.ts`.
 *
 * Coupling note: the canonical names below are copied verbatim from the
 * seed. If the seed renames a company or drug, update this map to match or
 * live candidates will start being rejected at entity resolution.
 */

export interface NameMatcher {
  canonical: string;
  /** Lowercase substrings that identify the entity in free text. */
  keys: string[];
}

/**
 * The 20 tracked companies. Keys are ordered longest-first at match time so
 * a specific alias wins over a short generic one.
 */
const COMPANIES: NameMatcher[] = [
  { canonical: "Sun Pharmaceutical Industries Ltd", keys: ["sun pharmaceutical", "sun pharma"] },
  { canonical: "Dr. Reddy's Laboratories Ltd", keys: ["dr. reddy's laboratories", "dr reddy's laboratories", "dr. reddy's", "dr reddy's", "dr. reddy", "dr reddy"] },
  { canonical: "Cipla Ltd", keys: ["cipla"] },
  { canonical: "Biocon Ltd", keys: ["biocon"] },
  { canonical: "Divi's Laboratories Ltd", keys: ["divi's laboratories", "divis laboratories", "divi's", "divis"] },
  { canonical: "Lupin Ltd", keys: ["lupin"] },
  { canonical: "Aurobindo Pharma Ltd", keys: ["aurobindo pharma", "aurobindo"] },
  { canonical: "Zydus Lifesciences Ltd", keys: ["zydus lifesciences", "zydus"] },
  { canonical: "Torrent Pharmaceuticals Ltd", keys: ["torrent pharmaceuticals", "torrent pharma", "torrent"] },
  { canonical: "Mankind Pharma Ltd", keys: ["mankind pharma", "mankind"] },
  { canonical: "Alkem Laboratories Ltd", keys: ["alkem laboratories", "alkem labs", "alkem"] },
  { canonical: "Ipca Laboratories Ltd", keys: ["ipca laboratories", "ipca labs", "ipca"] },
  { canonical: "Glenmark Pharmaceuticals Ltd", keys: ["glenmark pharmaceuticals", "glenmark pharma", "glenmark"] },
  { canonical: "Laurus Labs Ltd", keys: ["laurus labs", "laurus laboratories", "laurus"] },
  { canonical: "Ajanta Pharma Ltd", keys: ["ajanta pharma", "ajanta"] },
  { canonical: "Natco Pharma Ltd", keys: ["natco pharma", "natco"] },
  { canonical: "J.B. Chemicals & Pharmaceuticals Ltd", keys: ["j.b. chemicals & pharmaceuticals", "j.b. chemicals", "jb chemicals", "jb pharma"] },
  { canonical: "Granules India Ltd", keys: ["granules india", "granules"] },
  { canonical: "Piramal Pharma Ltd", keys: ["piramal pharma", "piramal"] },
  { canonical: "Alembic Pharmaceuticals Ltd", keys: ["alembic pharmaceuticals", "alembic pharma", "alembic"] },
  { canonical: "Gland Pharma Ltd", keys: ["gland pharma", "gland"] },
  { canonical: "Abbott India Ltd", keys: ["abbott india", "abbott"] },
  { canonical: "Wockhardt Ltd", keys: ["wockhardt"] },
  { canonical: "Sai Life Sciences Ltd", keys: ["sai life sciences", "sai life"] },
  { canonical: "Sanofi India Ltd", keys: ["sanofi india"] },
  { canonical: "Pfizer Ltd", keys: ["pfizer ltd", "pfizer india"] },
  { canonical: "Strides Pharma Science Ltd", keys: ["strides pharma science", "strides pharma", "strides"] },
  { canonical: "Syngene International Ltd", keys: ["syngene international", "syngene"] },
  { canonical: "Neuland Laboratories Ltd", keys: ["neuland laboratories", "neuland labs", "neuland"] },
  { canonical: "Shilpa Medicare Ltd", keys: ["shilpa medicare", "shilpa"] },
  { canonical: "Krebs Biochemicals & Industries Ltd", keys: ["krebs biochemicals", "krebs"] },
  { canonical: "Morepen Laboratories Ltd", keys: ["morepen laboratories", "morepen labs", "morepen", "dr. morepen"] },
  { canonical: "Vivimed Labs Ltd", keys: ["vivimed labs", "vivimed"] },
  { canonical: "Kilitch Drugs (India) Ltd", keys: ["kilitch drugs", "kilitch"] },
  { canonical: "Novartis India Ltd", keys: ["novartis india"] },
  { canonical: "Bafna Pharmaceuticals Ltd", keys: ["bafna pharmaceuticals", "bafna pharma", "bafna"] },
  { canonical: "Sunil Healthcare Ltd", keys: ["sunil healthcare", "sunil"] },
  { canonical: "Symbiotec Pharmalab Ltd", keys: ["symbiotec pharmalab", "symbiotec"] },
  { canonical: "MediCaps Ltd", keys: ["medicaps"] },
  { canonical: "Ind-Swift Laboratories Ltd", keys: ["ind-swift laboratories", "ind-swift labs", "ind-swift", "ind swift"] },
  { canonical: "Cohance Lifesciences Ltd", keys: ["cohance lifesciences", "cohance", "suven pharmaceuticals"] },
  { canonical: "Aarti Pharmalabs Ltd", keys: ["aarti pharmalabs", "aarti pharma labs", "aarti pharmalab"] },
  { canonical: "Medico Remedies Ltd", keys: ["medico remedies"] },
  { canonical: "Ortin Global Ltd", keys: ["ortin global", "ortin laboratories", "ortin"] },
  { canonical: "Kopran Ltd", keys: ["kopran"] },
  { canonical: "Parnax Lab Ltd", keys: ["parnax lab", "parnax"] },
  { canonical: "IOL Chemicals and Pharmaceuticals Ltd", keys: ["iol chemicals", "iolcp"] },
  { canonical: "Aarey Drugs & Pharmaceuticals Ltd", keys: ["aarey drugs", "aarey"] },
  { canonical: "Shree Ganesh Remedies Ltd", keys: ["shree ganesh remedies", "shree ganesh"] },
  { canonical: "Marksans Pharma Ltd", keys: ["marksans pharma", "marksans"] },
  { canonical: "Beta Drugs Ltd", keys: ["beta drugs"] },
  { canonical: "Makers Laboratories Ltd", keys: ["makers laboratories", "makers labs"] },
  { canonical: "Rubicon Research Ltd", keys: ["rubicon research"] },
  { canonical: "Innova Captab Ltd", keys: ["innova captab"] },
  { canonical: "Blue Jet Healthcare Ltd", keys: ["blue jet healthcare", "blue jet"] },
  { canonical: "Fermenta Biotech Ltd", keys: ["fermenta biotech", "fermenta"] },
  { canonical: "NGL Fine-Chem Ltd", keys: ["ngl fine-chem", "ngl fine chem", "ngl"] },
  { canonical: "Vaishali Pharma Ltd", keys: ["vaishali pharma", "vaishali"] },
  { canonical: "Hikal Ltd", keys: ["hikal"] },
  { canonical: "Emcure Pharmaceuticals Ltd", keys: ["emcure pharmaceuticals", "emcure"] },
  { canonical: "Jenburkt Pharmaceuticals Ltd", keys: ["jenburkt pharmaceuticals", "jenburkt"] },
  { canonical: "GlaxoSmithKline Pharmaceuticals Ltd", keys: ["glaxosmithkline pharmaceuticals", "gsk india"] },
  { canonical: "Venus Remedies Ltd", keys: ["venus remedies"] },
  { canonical: "Medplus Health Services Ltd", keys: ["medplus health", "medplus"] },
  { canonical: "Eris Lifesciences Ltd", keys: ["eris lifesciences"] },
  { canonical: "Amrutanjan Health Care Ltd", keys: ["amrutanjan health", "amrutanjan"] },
  { canonical: "Anthem Biosciences Ltd", keys: ["anthem biosciences"] },
  { canonical: "Alivus Life Sciences Ltd", keys: ["alivus life sciences", "alivus", "glenmark life sciences"] },
  { canonical: "Alpa Laboratories Ltd", keys: ["alpa laboratories", "alpa labs", "alpa"] },
  { canonical: "Shukra Pharmaceuticals Ltd", keys: ["shukra pharmaceuticals", "shukra"] },
  { canonical: "Sudeep Pharma Ltd", keys: ["sudeep pharma", "sudeep"] },
  { canonical: "Lincoln Pharmaceuticals Ltd", keys: ["lincoln pharmaceuticals", "lincoln pharma"] },
  { canonical: "Akums Drugs & Pharmaceuticals Ltd", keys: ["akums drugs", "akums"] },
  { canonical: "Zim Laboratories Ltd", keys: ["zim laboratories", "zim labs", "zim"] },
  { canonical: "Orchid Pharma Ltd", keys: ["orchid pharma"] },
  { canonical: "Wanbury Ltd", keys: ["wanbury"] },
  { canonical: "Haleos Labs Ltd", keys: ["haleos labs", "haleos"] },
  { canonical: "Windlas Biotech Ltd", keys: ["windlas biotech", "windlas"] },
  { canonical: "OneSource Specialty Pharma Ltd", keys: ["onesource specialty", "onesource", "stelis biopharma", "stelis"] },
  { canonical: "Valiant Laboratories Ltd", keys: ["valiant laboratories", "valiant labs"] },
  { canonical: "TTK Healthcare Ltd", keys: ["ttk healthcare", "ttk"] },
  { canonical: "Medicamen Biotech Ltd", keys: ["medicamen biotech", "medicamen"] },
  { canonical: "FDC Ltd", keys: ["fdc"] },
  { canonical: "Sai Parenterals Ltd", keys: ["sai parenterals"] },
  { canonical: "SMS Pharmaceuticals Ltd", keys: ["sms pharmaceuticals", "sms pharma"] },
  { canonical: "Bajaj Healthcare Ltd", keys: ["bajaj healthcare", "bajaj"] },
  { canonical: "Solara Active Pharma Sciences Ltd", keys: ["solara active pharma", "solara"] },
  { canonical: "Gujarat Themis Biosyn Ltd", keys: ["gujarat themis biosyn", "gujarat themis"] },
  { canonical: "Sun Pharma Advanced Research Company Ltd", keys: ["sun pharma advanced research", "sparc"] },
  { canonical: "Bliss GVS Pharma Ltd", keys: ["bliss gvs pharma", "bliss gvs"] },
  { canonical: "Sigachi Industries Ltd", keys: ["sigachi industries", "sigachi"] },
  { canonical: "Entero Healthcare Solutions Ltd", keys: ["entero healthcare"] },
  { canonical: "Viyash Scientific Ltd", keys: ["viyash scientific", "viyash", "sequent scientific", "sequent"] },
  { canonical: "Anuh Pharma Ltd", keys: ["anuh pharma", "anuh"] },
  { canonical: "Albert David Ltd", keys: ["albert david"] },
  { canonical: "Brooks Laboratories Ltd", keys: ["brooks laboratories", "brooks labs"] },
  { canonical: "Panacea Biotec Ltd", keys: ["panacea biotec"] },
  { canonical: "Unichem Laboratories Ltd", keys: ["unichem laboratories", "unichem labs", "unichem"] },
  { canonical: "Balaxi Pharmaceuticals Ltd", keys: ["balaxi pharmaceuticals", "balaxi pharma", "balaxi"] },
  { canonical: "Lyka Labs Ltd", keys: ["lyka labs", "lyka"] },
  { canonical: "Supriya Lifescience Ltd", keys: ["supriya lifescience", "supriya"] },
  { canonical: "Zota Healthcare Ltd", keys: ["zota healthcare", "zota"] },
  { canonical: "Kwality Pharmaceuticals Ltd", keys: ["kwality pharmaceuticals", "kwality pharma", "kwality"] },
  { canonical: "Par Drugs & Chemicals Ltd", keys: ["par drugs"] },
  { canonical: "Natural Capsules Ltd", keys: ["natural capsules"] },
  { canonical: "Hester Biosciences Ltd", keys: ["hester biosciences", "hester"] },
  { canonical: "Aarti Drugs Ltd", keys: ["aarti drugs"] },
  { canonical: "AstraZeneca Pharma India Ltd", keys: ["astrazeneca pharma india", "astrazeneca india"] },
  { canonical: "Acutaas Chemicals Ltd", keys: ["acutaas chemicals", "acutaas", "ami organics"] },
  { canonical: "Jagsonpal Pharmaceuticals Ltd", keys: ["jagsonpal pharmaceuticals", "jagsonpal"] },
  { canonical: "Nectar Lifesciences Ltd", keys: ["nectar lifesciences"] },
  { canonical: "Senores Pharmaceuticals Ltd", keys: ["senores pharmaceuticals", "senores pharma", "senores"] },
  { canonical: "Advanced Enzyme Technologies Ltd", keys: ["advanced enzyme technologies", "advanced enzyme", "advanced enzymes"] },
  { canonical: "Themis Medicare Ltd", keys: ["themis medicare", "themis"] },
  { canonical: "Jubilant Pharmova Ltd", keys: ["jubilant pharmova", "jubilant"] },
  { canonical: "Corona Remedies Ltd", keys: ["corona remedies"] },
  { canonical: "Caplin Point Laboratories Ltd", keys: ["caplin point laboratories", "caplin point"] },
  { canonical: "Gufic BioSciences Ltd", keys: ["gufic biosciences", "gufic"] },
  { canonical: "Vineet Laboratories Ltd", keys: ["vineet laboratories", "vineet labs", "vineet"] },
  { canonical: "Bal Pharma Ltd", keys: ["bal pharma"] },
  { canonical: "RPG Life Sciences Ltd", keys: ["rpg life sciences", "rpg"] },
  { canonical: "Fredun Pharmaceuticals Ltd", keys: ["fredun pharmaceuticals", "fredun pharma", "fredun"] },
  { canonical: "Biofil Chemicals & Pharmaceuticals Ltd", keys: ["biofil chemicals", "biofil"] },
  { canonical: "Procter & Gamble Health Ltd", keys: ["procter & gamble health", "p&g health", "merck ltd"] },
  { canonical: "Suven Life Sciences Ltd", keys: ["suven life sciences", "suven"] },
  { canonical: "Indoco Remedies Ltd", keys: ["indoco remedies", "indoco"] },
  { canonical: "Zydus Wellness Ltd", keys: ["zydus wellness"] },
  { canonical: "Jeena Sikho Lifecare Ltd", keys: ["jeena sikho lifecare", "jeena sikho"] },
  { canonical: "Bharat Parenterals Ltd", keys: ["bharat parenterals"] },
  { canonical: "Ambalal Sarabhai Enterprises Ltd", keys: ["ambalal sarabhai enterprises", "ambalal sarabhai"] },
  { canonical: "Syncom Formulation (India) Ltd", keys: ["syncom formulation", "syncom"] },
  { canonical: "Dishman Carbogen Amcis Ltd", keys: ["dishman carbogen amcis", "carbogen amcis", "dishman"] },
  { canonical: "Anlon Healthcare Ltd", keys: ["anlon healthcare", "anlon"] },
  { canonical: "Mangalam Drugs and Organics Ltd", keys: ["mangalam drugs", "mangalam"] },
];

/**
 * Tracked drugs (canonical name + seed aliases, lowercased). In practice
 * only genuinely marketed names (e.g. "Lipaglyn"/"Saroglitazar") ever occur
 * in real-world text; the fictional pipeline codes are included for
 * completeness and simply never match.
 */
const DRUGS: NameMatcher[] = [
  { canonical: "SUN-103", keys: ["sun-103", "sun pharma il-17 inhibitor"] },
  { canonical: "SUN-GLP1", keys: ["sun-glp1", "sun oral glp-1 candidate"] },
  { canonical: "DRL-Denosumab", keys: ["drl-denosumab", "denosumab biosimilar"] },
  { canonical: "DRL-Tocilizumab", keys: ["drl-tocilizumab", "tocilizumab biosimilar"] },
  { canonical: "CPL-TRIPLE", keys: ["cpl-triple", "triple-combination inhaler"] },
  { canonical: "CPL-NEB", keys: ["cpl-neb", "nebulised bronchodilator"] },
  { canonical: "BCN-Trastuzumab", keys: ["bcn-trastuzumab", "trastuzumab biosimilar"] },
  { canonical: "BCN-Glargine", keys: ["bcn-glargine", "insulin glargine biosimilar"] },
  { canonical: "DVS-NCE1", keys: ["dvs-nce1", "novel chemical entity 1"] },
  { canonical: "DVS-API2", keys: ["dvs-api2", "custom-synthesis intermediate"] },
  { canonical: "LPN-NEB", keys: ["lpn-neb", "complex generic nebuliser"] },
  { canonical: "LPN-Etanercept", keys: ["lpn-etanercept", "etanercept biosimilar"] },
  { canonical: "ARP-Daratumumab", keys: ["arp-daratumumab", "daratumumab biosimilar"] },
  { canonical: "ARP-Lenalidomide", keys: ["arp-lenalidomide", "lenalidomide generic"] },
  { canonical: "Saroglitazar", keys: ["saroglitazar", "lipaglyn", "zyh1"] },
  { canonical: "ZYD-VAX21", keys: ["zyd-vax21", "novel vaccine candidate"] },
  { canonical: "TRP-GLP1", keys: ["trp-glp1", "torrent oral glp-1"] },
  { canonical: "TRP-CNS7", keys: ["trp-cns7", "cns candidate 7"] },
  { canonical: "MNK-DERM4", keys: ["mnk-derm4", "dermatology candidate 4"] },
  { canonical: "MNK-DIA9", keys: ["mnk-dia9", "antidiabetic fixed-dose combination"] },
];

function buildIndex(matchers: NameMatcher[]): { key: string; canonical: string }[] {
  const flat: { key: string; canonical: string }[] = [];
  for (const m of matchers) {
    for (const key of m.keys) flat.push({ key, canonical: m.canonical });
  }
  // Longest key first — a specific alias beats a short generic substring.
  flat.sort((a, b) => b.key.length - a.key.length);
  return flat;
}


function matchIndex(index: { key: string; canonical: string }[], raw: string | null): string | null {
  if (!raw) return null;
  const hay = raw.toLowerCase();
  for (const { key, canonical } of index) {
    if (hay.includes(key)) return canonical;
  }
  return null;
}

/**
 * Map a real-world sponsor/publisher string to a canonical company name, or
 * null when it names none of the tracked companies. Null means "not ours" —
 * callers should drop the candidate rather than emit an unresolvable name.
 */
export function matchCompanyName(raw: string | null | undefined): string | null {
  return matchIndex(COMPANY_INDEX, raw ?? null);
}

/** Map a real-world drug/intervention string to a canonical drug name, or null. */
export function matchDrugName(raw: string | null | undefined): string | null {
  return matchIndex(DRUG_INDEX, raw ?? null);
}

/**
 * Sponsor search terms for the ClinicalTrials.gov API (`query.spons`).
 * Distinctive per company; `normalize` still verifies the lead sponsor via
 * `matchCompanyName`, so an over-broad query term only costs filtering, not
 * correctness.
 */
export const SPONSOR_QUERIES: string[] = [
  "Sun Pharmaceutical",
  "Reddy",
  "Cipla",
  "Biocon",
  "Divi",
  "Lupin",
  "Aurobindo",
  "Zydus",
  "Torrent",
  "Mankind",
];

/**
 * Quoted phrases for the GDELT news query (OR-joined by the caller).
 */
export const NEWS_PHRASES: string[] = [
  "Sun Pharma",
  "Dr Reddy",
  "Cipla",
  "Biocon",
  "Divi's",
  "Lupin",
  "Aurobindo",
  "Zydus",
  "Torrent Pharma",
  "Mankind Pharma",
];

/**
 * Global pharma majors tracked for India impact. Keys avoid short generic
 * words ("AZ", "Novo" alone) that would misattribute unrelated news.
 * Canonical names match packages/data/src/global-companies.ts verbatim.
 */
const GLOBAL_COMPANIES: NameMatcher[] = [
  { canonical: "Pfizer Inc", keys: ["pfizer inc", "pfizer incorporated", "pfizer"] },
  { canonical: "Johnson & Johnson", keys: ["johnson & johnson", "johnson and johnson", "j&j"] },
  { canonical: "Merck & Co., Inc.", keys: ["merck & co", "merck and co", "merck sharp", "msd", "merck"] },
  { canonical: "Eli Lilly and Company", keys: ["eli lilly", "lilly"] },
  { canonical: "AbbVie Inc", keys: ["abbvie"] },
  { canonical: "Bristol Myers Squibb", keys: ["bristol myers squibb", "bristol-myers squibb", "bristol myers", "bms"] },
  { canonical: "Amgen Inc", keys: ["amgen"] },
  { canonical: "Gilead Sciences, Inc.", keys: ["gilead sciences", "gilead"] },
  { canonical: "Moderna, Inc.", keys: ["moderna"] },
  { canonical: "Biogen Inc", keys: ["biogen"] },
  { canonical: "Novartis AG", keys: ["novartis ag", "novartis"] },
  { canonical: "Roche Holding AG", keys: ["roche"] },
  { canonical: "Sandoz Group AG", keys: ["sandoz"] },
  { canonical: "Novo Nordisk A/S", keys: ["novo nordisk", "novonordisk"] },
  { canonical: "AstraZeneca PLC", keys: ["astrazeneca"] },
  { canonical: "GSK plc", keys: ["gsk plc", "gsk", "glaxosmithkline"] },
  { canonical: "Sanofi", keys: ["sanofi"] },
  { canonical: "Takeda Pharmaceutical Company", keys: ["takeda"] },
  { canonical: "Bayer AG", keys: ["bayer"] },
];

/**
 * IPO watchlist — unlisted Indian pharma companies with filed DRHPs.
 * Canonical names match packages/data/src/ipo-watchlist.ts verbatim.
 */
const IPO_COMPANIES: NameMatcher[] = [
  { canonical: "Claroid Pharmaceuticals Ltd", keys: ["claroid pharmaceuticals", "claroid pharma", "claroid"] },
  { canonical: "Hindustan Laboratories", keys: ["hindustan laboratories", "hindustan labs"] },
  { canonical: "Injecto Polymers", keys: ["injecto polymers", "injecto"] },
];

/**
 * Quoted phrases for the GDELT adapter's second (global + IPO) query.
 * Kept separate from NEWS_PHRASES so the original India-focused query
 * stays tight; the adapter OR-joins each list independently.
 */
export const GLOBAL_NEWS_PHRASES: string[] = [
  "Pfizer",
  "Johnson & Johnson",
  "Merck",
  "Eli Lilly",
  "AbbVie",
  "Bristol Myers Squibb",
  "Amgen",
  "Gilead",
  "Moderna",
  "Biogen",
  "Novartis",
  "Roche",
  "Sandoz",
  "Novo Nordisk",
  "AstraZeneca",
  "GSK",
  "Sanofi",
  "Takeda",
  "Bayer",
  "Claroid Pharma",
  "Hindustan Laboratories",
  "Rubicon Research",
  "Symbiotec",
  "Injecto Polymers",
];


// Index construction lives at the end so every matcher list above is
// declared before the indexes are built (const TDZ).
const COMPANY_INDEX = buildIndex([...COMPANIES, ...GLOBAL_COMPANIES, ...IPO_COMPANIES]);
const DRUG_INDEX = buildIndex(DRUGS);
