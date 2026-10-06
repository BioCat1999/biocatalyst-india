/**
 * Orange Book patents — FDA patent listings for approved drugs.
 *
 * The FDA publishes a monthly ZIP of `~`-delimited files
 * (https://www.fda.gov/drugs/drug-approvals-and-databases/orange-book-data-files):
 *   - patent.txt   — patent_number, expiry date, substance/product flags per
 *                    (appl_no, product_no). Only NDA patents are listed.
 *   - products.txt — trade name, applicant, active ingredient per
 *                    (appl_no, product_no).
 *
 * `syncOrangeBookPatents()` downloads the snapshot, joins the two files,
 * resolves the applicant to a tracked company, and upserts into `patents`
 * (migration 011). Re-running is idempotent; delisted rows are kept with
 * delisted=true. No API key, no registration — plain HTTPS.
 *
 * Queries power the /patents cliff tracker, the company-page patent
 * section, and the per-drug patent list.
 */
import { inflateRawSync } from "node:zlib";
import type { Pool } from "pg";
import { getPool } from "@biocatalyst/db";
import type { OrangeBookPatent } from "@biocatalyst/types";

/** FDA Orange Book monthly data-files ZIP (media id changes on re-upload; override via env). */
export const ORANGE_BOOK_ZIP_URL =
  process.env.ORANGE_BOOK_ZIP_URL ??
  "https://www.fda.gov/media/76860/download?attachment";

const REQUEST_TIMEOUT_MS = 60_000;
const USER_AGENT = "BiocatalystIndia/1.0 (personal research use; Orange Book ingestion)";

/* ------------------------------------------------------------------ */
/* Minimal ZIP reader (stored + deflated entries, no dependency)       */
/* ------------------------------------------------------------------ */

/**
 * Extract files from a ZIP archive via the central directory (robust
 * against data descriptors, which zero the sizes in local headers — the
 * Orange Book ZIP uses them). Supports method 0 (stored) and 8
 * (deflated). Enough for the Orange Book snapshot ZIP.
 */
export function extractZipFiles(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // Find End of Central Directory (last 64KB + 22 bytes).
  let eocd = -1;
  const scanStart = Math.max(0, buf.length - 65558);
  for (let i = buf.length - 22; i >= scanStart; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("orange-book: ZIP end-of-central-directory not found");
  const cdCount = buf.readUInt16LE(eocd + 10);
  const cdOff = buf.readUInt32LE(eocd + 16);

  let p = cdOff;
  for (let n = 0; n < cdCount; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error("orange-book: corrupt ZIP central directory");
    }
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    // Data starts after the local header at localOff.
    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataOff = localOff + 30 + lhNameLen + lhExtraLen;
    const comp = buf.subarray(dataOff, dataOff + compSize);
    if (method === 0) out.set(name, Buffer.from(comp));
    else if (method === 8) out.set(name, inflateRawSync(comp));
    // other methods: skip (not present in the Orange Book ZIP)
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tilde-delimited parsing                                             */
/* ------------------------------------------------------------------ */

/** Split `~`-delimited text into rows (no quoting in Orange Book files). */
export function parseTildeDelimited(text: string): string[][] {
  return text
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.length > 0)
    .map((l) => l.split("~"));
}

function headerIndex(header: string[], name: string): number {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`orange-book: missing column ${name}`);
  return i;
}

/** "Aug 24, 2026" → "2026-08-24"; null when unparseable. */
export function parseOrangeBookDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(s.trim());
  if (!m) return null;
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const mm = months[m[1]];
  if (!mm) return null;
  return `${m[3]}-${mm}-${m[2].padStart(2, "0")}`;
}

export interface ParsedPatentRow {
  patentNumber: string;
  applNo: string;
  productNo: string;
  tradeName: string;
  applicant: string;
  activeIngredient: string;
  expiryDate: string | null;
  drugSubstanceFlag: boolean;
  drugProductFlag: boolean;
  patentUseCode: string | null;
  delisted: boolean;
}

/**
 * Join patent.txt to products.txt on (appl_no, product_no). Rows whose
 * product is missing are dropped (shouldn't happen — the FDA ships them
 * in sync; the join is verified in tests against the live files).
 */
export function parsePatentRows(patentTxt: string, productsTxt: string): ParsedPatentRow[] {
  const pLines = parseTildeDelimited(patentTxt);
  const pHead = pLines[0];
  const pi = {
    applNo: headerIndex(pHead, "Appl_No"),
    productNo: headerIndex(pHead, "Product_No"),
    patentNo: headerIndex(pHead, "Patent_No"),
    expiry: headerIndex(pHead, "Patent_Expire_Date_Text"),
    dsFlag: headerIndex(pHead, "Drug_Substance_Flag"),
    dpFlag: headerIndex(pHead, "Drug_Product_Flag"),
    useCode: headerIndex(pHead, "Patent_Use_Code"),
    delist: headerIndex(pHead, "Delist_Flag"),
  };

  const prLines = parseTildeDelimited(productsTxt);
  const prHead = prLines[0];
  const ri = {
    applNo: headerIndex(prHead, "Appl_No"),
    productNo: headerIndex(prHead, "Product_No"),
    tradeName: headerIndex(prHead, "Trade_Name"),
    applicant: headerIndex(prHead, "Applicant_Full_Name"),
    ingredient: headerIndex(prHead, "Ingredient"),
  };
  const products = new Map<string, { tradeName: string; applicant: string; ingredient: string }>();
  for (const r of prLines.slice(1)) {
    products.set(`${r[ri.applNo]}|${r[ri.productNo]}`, {
      tradeName: r[ri.tradeName] ?? "",
      applicant: r[ri.applicant] ?? "",
      ingredient: r[ri.ingredient] ?? "",
    });
  }

  const rows: ParsedPatentRow[] = [];
  for (const r of pLines.slice(1)) {
    const key = `${r[pi.applNo]}|${r[pi.productNo]}`;
    const prod = products.get(key);
    if (!prod) continue;
    rows.push({
      patentNumber: r[pi.patentNo] ?? "",
      applNo: r[pi.applNo] ?? "",
      productNo: r[pi.productNo] ?? "",
      tradeName: prod.tradeName,
      applicant: prod.applicant,
      activeIngredient: prod.ingredient,
      expiryDate: parseOrangeBookDate(r[pi.expiry]),
      drugSubstanceFlag: (r[pi.dsFlag] ?? "").toUpperCase() === "Y",
      drugProductFlag: (r[pi.dpFlag] ?? "").toUpperCase() === "Y",
      patentUseCode: r[pi.useCode]?.trim() ? r[pi.useCode].trim() : null,
      delisted: (r[pi.delist] ?? "").toUpperCase() === "Y",
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Applicant → tracked company resolution                              */
/* ------------------------------------------------------------------ */

const CORPORATE_SUFFIXES = new Set([
  "INC", "LTD", "LIMITED", "LLC", "CORP", "CORPORATION", "CO", "COMPANY",
  "LP", "LLP", "PLC", "SA", "AG", "GMBH", "AB", "APS", "PTY", "BV",
  "PTE", "SAS", "SRL", "SPA", "NV", "FZE",
]);

/**
 * Normalize an applicant/company name for matching: uppercase, strip
 * punctuation, drop parentheticals, strip trailing corporate suffixes.
 * "NOVARTIS PHARMACEUTICALS CORP" → "NOVARTIS PHARMACEUTICALS".
 */
export function normalizeApplicantName(name: string): string {
  let s = name.toUpperCase().replace(/\(.*?\)/g, " ");
  s = s.replace(/['’]/g, "").replace(/[.,&]/g, " ").replace(/[^A-Z0-9 ]/g, " ");
  const toks = s.split(/\s+/).filter(Boolean);
  while (toks.length > 1 && CORPORATE_SUFFIXES.has(toks[toks.length - 1])) toks.pop();
  // "ELI LILLY AND CO" → "ELI LILLY" (CO stripped above leaves a dangling AND)
  if (toks.length > 1 && toks[toks.length - 1] === "AND") toks.pop();
  return toks.join(" ");
}

/**
 * Curated Orange Book applicant → company slug map for US arms and
 * subsidiaries the generic rules miss. Keyed by RAW applicant name
 * (exact, as shipped in products.txt). A null value means "known
 * non-match" — never attribute (e.g. Merck KGaA vs Merck & Co).
 */
export const APPLICANT_TO_SLUG: Record<string, string | null> = {
  "CIPLA USA INC": "cipla",
  "AUROBINDO PHARMA USA INC": "aurobindo-pharma",
  "ZYDUS PHARMACEUTICALS USA INC": "zydus-lifesciences",
  "ZYDUS HEALTHCARE USA LLC": "zydus-lifesciences",
  "GLENMARK PHARMACEUTICALS INC USA": "glenmark-pharma",
  "GLENMARK GENERICS INC USA": "glenmark-pharma",
  "TORRENT PHARMA INC": "torrent-pharma",
  "TORRENT PHARMACEUTICALS LLC": "torrent-pharma",
  "SUN PHARMA CANADA INC": "sun-pharma",
  "SUN PHARMACEUTICAL INDUSTRIES INC": "sun-pharma",
  "NATCO PHARMA USA LLC": "natco-pharma",
  "LUPIN INC": "lupin",
  "NOVARTIS PHARMACEUTICALS CORP": "novartis",
  "SANDOZ INC": "sandoz",
  "MERCK KGAA": null,
  "FOSUN PHARMA USA INC": null,
  "HISUN PHARMACEUTICAL (HANGZHOU) CO LTD": null,
  "HISUN PHARMACEUTICAL HANGZHOU CO LTD": null,
  "JANSSEN PHARMACEUTICALS INC": "johnson-johnson",
  "JANSSEN BIOTECH INC": "johnson-johnson",
  "JANSSEN PRODUCTS LP": "johnson-johnson",
  "JANSSEN PHARMACEUTICA PRODUCTS LP": "johnson-johnson",
  "HOFFMANN LA ROCHE INC": "roche",
  "HOFFMANN-LA ROCHE INC": "roche",
  "ASTRAZENECA AB": "astrazeneca",
  "ASTRAZENECA PHARMACEUTICALS LP": "astrazeneca",
  "ASTRAZENECA LP": "astrazeneca",
  "PFIZER INC": "pfizer",
  "GLAXOSMITHKLINE": "gsk",
  "GLAXO GROUP LTD DBA GLAXOSMITHKLINE": "gsk",
  "GLAXO GROUP LTD ENGLAND DBA GLAXOSMITHKLINE": "gsk",
  "GLAXOSMITHKLINE INTELLECTUAL PROPERTY NO 2 LTD ENGLAND": "gsk",
  "GLAXOSMITHKLINE INTELLECTUAL PROPERTY DEVELOPMENT LTD ENGLAND": "gsk",
  "SANOFI AVENTIS US LLC": "sanofi",
  "SANOFI AVENTIS US INC": "sanofi",
  "BRISTOL MYERS SQUIBB CO": "bristol-myers-squibb",
  "E R SQUIBB AND SONS LLC": "bristol-myers-squibb",
  "TAKEDA PHARMACEUTICALS USA INC": "takeda",
  "TAKEDA PHARMACEUTICALS AMERICA INC": "takeda",
  "TAKEDA PHARMACEUTICALS NORTH AMERICA INC": "takeda",
  "TAKEDA CHEMICAL INDUSTRIES LTD": "takeda",
};

export interface CompanyNameEntry {
  id: string;
  slug: string;
  names: string[]; // canonical + aliases, normalized
}

/**
 * Resolve an Orange Book applicant to a tracked company id.
 * Order: curated exact map → scored generic match (exact normalized
 * equality beats token containment; longer names beat shorter; canonical
 * names beat aliases; on a full tie the shorter slug wins — the parent
 * company usually owns the shorter slug, e.g. pfizer vs pfizer-india).
 * This keeps broad subsidiary aliases (e.g. "AstraZeneca" on the Indian
 * subsidiary) from stealing the parent's patents. Returns null when
 * nothing matches (row keeps null company_id).
 */
export function resolveApplicantCompany(
  applicant: string,
  companies: CompanyNameEntry[],
): string | null {
  if (Object.prototype.hasOwnProperty.call(APPLICANT_TO_SLUG, applicant)) {
    const slug = APPLICANT_TO_SLUG[applicant];
    if (!slug) return null;
    return companies.find((c) => c.slug === slug)?.id ?? null;
  }
  const norm = normalizeApplicantName(applicant);
  const normToks = norm.split(" ");
  const best: { id: string; slug: string; score: number } = { id: "", slug: "", score: -Infinity };
  const consider = (id: string, slug: string, score: number) => {
    if (score > best.score || (score === best.score && slug.length < best.slug.length)) {
      best.id = id;
      best.slug = slug;
      best.score = score;
    }
  };
  companies.forEach((c) => {
    c.names.forEach((name, idx) => {
      const nt = name.split(" ");
      if (name === norm) {
        // Exact: canonical (idx 0) outranks aliases; longer wins.
        consider(c.id, c.slug, 1000 + nt.length * 10 - idx);
        return;
      }
      // Ordered token containment (word-boundary safe).
      let j = 0;
      for (const t of normToks) {
        if (t === nt[j]) j++;
        if (j === nt.length) {
          consider(c.id, c.slug, nt.length * 10 - idx);
          break;
        }
      }
    });
  });
  return best.score > -Infinity ? best.id : null;
}

/* ------------------------------------------------------------------ */
/* Sync                                                                */
/* ------------------------------------------------------------------ */

export interface SyncPatentsResult {
  patents: number;
  resolvedCompanies: number;
  resolvedDrugs: number;
  delisted: number;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
): Promise<Buffer> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`orange-book: HTTP ${res.status} for ${url}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

/**
 * Download the Orange Book snapshot, parse, resolve applicants/drugs, and
 * upsert into `patents`. Idempotent — re-running updates rows in place.
 * Records a `sources` row for provenance (publisher "US FDA").
 */
export async function syncOrangeBookPatents(
  pool: Pool = getPool(),
  opts: { fetchImpl?: typeof fetch; zipUrl?: string } = {},
): Promise<SyncPatentsResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const zipUrl = opts.zipUrl ?? ORANGE_BOOK_ZIP_URL;

  const zipBuf = await fetchWithTimeout(fetchImpl, zipUrl);
  const files = extractZipFiles(zipBuf);
  const patentTxt = files.get("patent.txt")?.toString("utf8");
  const productsTxt = files.get("products.txt")?.toString("utf8");
  if (!patentTxt || !productsTxt) {
    throw new Error(
      `orange-book: ZIP missing patent.txt/products.txt (had: ${[...files.keys()].join(", ")})`,
    );
  }
  const rows = parsePatentRows(patentTxt, productsTxt);

  // Provenance source row (one per snapshot URL).
  const { rows: srows } = await pool.query<{ id: string }>(
    `INSERT INTO sources (source_type, title, publisher, url)
     VALUES ('reference','FDA Orange Book patent snapshot','US FDA',$1)
     ON CONFLICT (url) DO UPDATE SET retrieved_at = now()
     RETURNING id::text AS id`,
    [zipUrl],
  );
  const sourceId = srows[0].id;

  // Company name lookup: canonical + curated aliases, normalized.
  const { rows: crows } = await pool.query<{
    id: string;
    slug: string;
    canonical_name: string;
  }>(`SELECT id::text AS id, slug, canonical_name FROM companies`);
  const { rows: arows } = await pool.query<{ company_id: string; alias: string }>(
    `SELECT company_id::text AS company_id, alias FROM company_aliases`,
  );
  const aliasByCompany = new Map<string, string[]>();
  for (const a of arows) {
    const l = aliasByCompany.get(a.company_id) ?? [];
    l.push(a.alias);
    aliasByCompany.set(a.company_id, l);
  }
  const companies: CompanyNameEntry[] = crows.map((c) => ({
    id: c.id,
    slug: c.slug,
    names: [
      normalizeApplicantName(c.canonical_name),
      ...(aliasByCompany.get(c.id) ?? []).map(normalizeApplicantName),
    ],
  }));

  // Drug lookup: canonical name + aliases, uppercased.
  const { rows: drows } = await pool.query<{ id: string; canonical_name: string }>(
    `SELECT id::text AS id, canonical_name FROM drugs`,
  );
  const { rows: darows } = await pool.query<{ drug_id: string; alias: string }>(
    `SELECT drug_id::text AS drug_id, alias FROM drug_aliases`,
  );
  const drugByName = new Map<string, string>();
  for (const d of drows) drugByName.set(d.canonical_name.toUpperCase(), d.id);
  for (const a of darows) drugByName.set(a.alias.toUpperCase(), a.drug_id);

  let resolvedCompanies = 0;
  let resolvedDrugs = 0;
  let delisted = 0;
  for (const r of rows) {
    const companyId = resolveApplicantCompany(r.applicant, companies);
    const drugId =
      drugByName.get(r.tradeName.toUpperCase()) ??
      drugByName.get(r.activeIngredient.toUpperCase()) ??
      null;
    if (companyId) resolvedCompanies++;
    if (drugId) resolvedDrugs++;
    if (r.delisted) delisted++;
    await pool.query(
      `INSERT INTO patents
         (patent_number, appl_no, product_no, trade_name, applicant,
          active_ingredient, expiry_date, drug_substance_flag,
          drug_product_flag, patent_use_code, delisted, company_id, drug_id,
          source_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11,$12::uuid,$13::uuid,$14::uuid, now())
       ON CONFLICT (patent_number, appl_no, product_no) DO UPDATE SET
         trade_name = EXCLUDED.trade_name,
         applicant = EXCLUDED.applicant,
         active_ingredient = EXCLUDED.active_ingredient,
         expiry_date = EXCLUDED.expiry_date,
         drug_substance_flag = EXCLUDED.drug_substance_flag,
         drug_product_flag = EXCLUDED.drug_product_flag,
         patent_use_code = EXCLUDED.patent_use_code,
         delisted = EXCLUDED.delisted,
         company_id = EXCLUDED.company_id,
         drug_id = EXCLUDED.drug_id,
         source_id = EXCLUDED.source_id,
         updated_at = now()`,
      [
        r.patentNumber, r.applNo, r.productNo, r.tradeName, r.applicant,
        r.activeIngredient, r.expiryDate, r.drugSubstanceFlag,
        r.drugProductFlag, r.patentUseCode, r.delisted, companyId, drugId,
        sourceId,
      ],
    );
  }
  return { patents: rows.length, resolvedCompanies, resolvedDrugs, delisted };
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

interface PatentRow {
  id: string;
  patent_number: string;
  appl_no: string;
  product_no: string;
  trade_name: string;
  applicant: string;
  active_ingredient: string;
  expiry_date: string | null;
  drug_substance_flag: boolean;
  drug_product_flag: boolean;
  patent_use_code: string | null;
  delisted: boolean;
  company_id: string | null;
  drug_id: string | null;
}

function toPatent(r: PatentRow): OrangeBookPatent {
  return {
    id: r.id,
    patentNumber: r.patent_number,
    applNo: r.appl_no,
    productNo: r.product_no,
    tradeName: r.trade_name,
    applicant: r.applicant,
    activeIngredient: r.active_ingredient,
    expiryDate: r.expiry_date,
    drugSubstanceFlag: r.drug_substance_flag,
    drugProductFlag: r.drug_product_flag,
    patentUseCode: r.patent_use_code,
    delisted: r.delisted,
    companyId: r.company_id,
    drugId: r.drug_id,
  };
}

const PATENT_COLS = `id::text AS id, patent_number, appl_no, product_no,
  trade_name, applicant, active_ingredient,
  expiry_date::text AS expiry_date, drug_substance_flag, drug_product_flag,
  patent_use_code, delisted, company_id::text AS company_id,
  drug_id::text AS drug_id`;

/** Patents held by one tracked company (applicant match), soonest expiry first. */
export async function getPatentsForCompany(
  companyId: string,
  pool: Pool = getPool(),
  opts: { includeDelisted?: boolean } = {},
): Promise<OrangeBookPatent[]> {
  const { rows } = await pool.query<PatentRow>(
    `SELECT ${PATENT_COLS} FROM patents
     WHERE company_id = $1::uuid ${opts.includeDelisted ? "" : "AND delisted = FALSE"}
     ORDER BY expiry_date NULLS LAST, patent_number`,
    [companyId],
  );
  return rows.map(toPatent);
}

/** Patents linked to one tracked drug (trade-name/ingredient match). */
export async function getPatentsForDrug(
  drugId: string,
  pool: Pool = getPool(),
): Promise<OrangeBookPatent[]> {
  const { rows } = await pool.query<PatentRow>(
    `SELECT ${PATENT_COLS} FROM patents
     WHERE drug_id = $1::uuid AND delisted = FALSE
     ORDER BY expiry_date NULLS LAST, patent_number`,
    [drugId],
  );
  return rows.map(toPatent);
}

export interface PatentExpiryItem extends OrangeBookPatent {
  companySlug: string | null;
  companyName: string | null;
  daysToExpiry: number | null;
}

/**
 * The patent-cliff tracker: non-delisted patents expiring within
 * `withinDays` (default 365), soonest first. Unresolved applicants are
 * included with null company fields.
 */
export async function getUpcomingPatentExpiries(
  pool: Pool = getPool(),
  opts: { withinDays?: number; limit?: number; companyId?: string } = {},
): Promise<PatentExpiryItem[]> {
  const withinDays = opts.withinDays ?? 365;
  const limit = opts.limit ?? 200;
  const params: unknown[] = [withinDays, limit];
  let companyFilter = "";
  if (opts.companyId) {
    params.push(opts.companyId);
    companyFilter = `AND p.company_id = $3::uuid`;
  }
  const { rows } = await pool.query<
    PatentRow & {
      company_slug: string | null;
      company_name: string | null;
      days_to_expiry: number | null;
    }
  >(
    `SELECT p.id::text AS id, p.patent_number, p.appl_no, p.product_no,
       p.trade_name, p.applicant, p.active_ingredient,
       p.expiry_date::text AS expiry_date, p.drug_substance_flag,
       p.drug_product_flag, p.patent_use_code, p.delisted,
       p.company_id::text AS company_id, p.drug_id::text AS drug_id,
       c.slug AS company_slug, c.canonical_name AS company_name,
       (p.expiry_date - CURRENT_DATE)::int AS days_to_expiry
     FROM patents p LEFT JOIN companies c ON c.id = p.company_id
     WHERE p.delisted = FALSE
       AND p.expiry_date IS NOT NULL
       AND p.expiry_date >= CURRENT_DATE
       AND p.expiry_date <= CURRENT_DATE + $1::int * INTERVAL '1 day'
       ${companyFilter}
     ORDER BY p.expiry_date, p.patent_number
     LIMIT $2`,
    params,
  );
  return rows.map((r) => ({
    ...toPatent(r),
    companySlug: r.company_slug,
    companyName: r.company_name,
    daysToExpiry: r.days_to_expiry,
  }));
}

export interface PatentStats {
  total: number;
  withExpiry: number;
  delisted: number;
  expiringWithinYear: number;
  resolvedCompanies: number;
}

/** Snapshot counts for the /patents page header. */
export async function getPatentStats(pool: Pool = getPool()): Promise<PatentStats> {
  const { rows } = await pool.query<{
    total: number;
    with_expiry: number;
    delisted: number;
    expiring_within_year: number;
    resolved_companies: number;
  }>(
    `SELECT COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE expiry_date IS NOT NULL)::int AS with_expiry,
       COUNT(*) FILTER (WHERE delisted)::int AS delisted,
       COUNT(*) FILTER (WHERE NOT delisted AND expiry_date IS NOT NULL
         AND expiry_date >= CURRENT_DATE
         AND expiry_date <= CURRENT_DATE + INTERVAL '365 days')::int AS expiring_within_year,
       COUNT(DISTINCT company_id)::int AS resolved_companies
     FROM patents`,
  );
  const r = rows[0];
  return {
    total: r.total,
    withExpiry: r.with_expiry,
    delisted: r.delisted,
    expiringWithinYear: r.expiring_within_year,
    resolvedCompanies: r.resolved_companies,
  };
}
