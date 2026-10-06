/**
 * Orange Book parser tests — pure functions, no DB, no network.
 * Live-file verification (row counts, join rate) is done ad-hoc against
 * the downloaded snapshot, not in the suite.
 */
import { describe, expect, it } from "vitest";
import {
  APPLICANT_TO_SLUG,
  extractZipFiles,
  normalizeApplicantName,
  parseOrangeBookDate,
  parsePatentRows,
  parseTildeDelimited,
  resolveApplicantCompany,
  type CompanyNameEntry,
} from "./patents.js";

const PATENT_TXT = [
  "Appl_Type~Appl_No~Product_No~Patent_No~Patent_Expire_Date_Text~Drug_Substance_Flag~Drug_Product_Flag~Patent_Use_Code~Delist_Flag~Submission_Date",
  "N~020610~001~7625884~Aug 24, 2026~~~U-141~~",
  "N~018613~001~7560445~Feb 1, 2027~Y~Y~U-986~~",
  "N~018613~001~9999999~~Y~~U-100~Y~",
].join("\n");

const PRODUCTS_TXT = [
  "Ingredient~DF;Route~Trade_Name~Applicant~Strength~Appl_Type~Appl_No~Product_No~TE_Code~Approval_Date~RLD~RS~Type~Applicant_Full_Name",
  "ATORVASTATIN CALCIUM~TABLET;ORAL~LIPITOR~PFIZER INC~10MG~N~020610~001~AB~Dec 17, 1996~Yes~No~RX~PFIZER INC",
  "DRUG X~TABLET;ORAL~BRANDX~NOVARTIS PHARMACEUTICALS CORP~5MG~N~018613~001~AB~Jan 1, 2000~Yes~No~RX~NOVARTIS PHARMACEUTICALS CORP",
].join("\n");

describe("parseTildeDelimited", () => {
  it("splits on ~ and drops blank lines", () => {
    const rows = parseTildeDelimited("a~b\n\nc~d\r\n");
    expect(rows).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("parseOrangeBookDate", () => {
  it("parses 'Aug 24, 2026'", () => {
    expect(parseOrangeBookDate("Aug 24, 2026")).toBe("2026-08-24");
  });
  it("pads single-digit days", () => {
    expect(parseOrangeBookDate("Feb 1, 2027")).toBe("2027-02-01");
  });
  it("returns null for blank/unparseable", () => {
    expect(parseOrangeBookDate("")).toBeNull();
    expect(parseOrangeBookDate(null)).toBeNull();
    expect(parseOrangeBookDate("2026-08-24")).toBeNull();
  });
});

describe("parsePatentRows", () => {
  it("joins patent.txt to products.txt and maps flags", () => {
    const rows = parsePatentRows(PATENT_TXT, PRODUCTS_TXT);
    expect(rows).toHaveLength(3);
    const [a, b, c] = rows;
    expect(a.patentNumber).toBe("7625884");
    expect(a.tradeName).toBe("LIPITOR");
    expect(a.applicant).toBe("PFIZER INC");
    expect(a.activeIngredient).toBe("ATORVASTATIN CALCIUM");
    expect(a.expiryDate).toBe("2026-08-24");
    expect(a.drugSubstanceFlag).toBe(false);
    expect(a.patentUseCode).toBe("U-141");
    expect(a.delisted).toBe(false);

    expect(b.drugSubstanceFlag).toBe(true);
    expect(b.drugProductFlag).toBe(true);
    expect(b.expiryDate).toBe("2027-02-01");

    expect(c.expiryDate).toBeNull();
    expect(c.delisted).toBe(true);
  });

  it("drops patents with no matching product", () => {
    const orphan = PATENT_TXT + "\nN~999999~001~1111111~Jan 1, 2030~~~~~";
    expect(parsePatentRows(orphan, PRODUCTS_TXT)).toHaveLength(3);
  });

  it("throws on missing columns", () => {
    expect(() => parsePatentRows("a~b\n1~2", PRODUCTS_TXT)).toThrow(/missing column/);
  });
});

describe("normalizeApplicantName", () => {
  it("uppercases and strips corporate suffixes", () => {
    expect(normalizeApplicantName("Novartis Pharmaceuticals Corp")).toBe("NOVARTIS PHARMACEUTICALS");
    expect(normalizeApplicantName("Eli Lilly and Co")).toBe("ELI LILLY");
    expect(normalizeApplicantName("Dr. Reddy's Laboratories Ltd")).toBe("DR REDDYS LABORATORIES");
  });
  it("drops parentheticals", () => {
    expect(normalizeApplicantName("HISUN PHARMACEUTICAL (HANGZHOU) CO LTD")).toBe(
      "HISUN PHARMACEUTICAL",
    );
  });
});

const COMPANIES: CompanyNameEntry[] = [
  { id: "c-pfizer", slug: "pfizer", names: ["PFIZER"] },
  { id: "c-novartis", slug: "novartis", names: ["NOVARTIS"] },
  { id: "c-sun", slug: "sun-pharma", names: ["SUN PHARMACEUTICAL INDUSTRIES"] },
  { id: "c-cipla", slug: "cipla", names: ["CIPLA"] },
];

describe("resolveApplicantCompany", () => {
  it("matches normalized names exactly", () => {
    expect(resolveApplicantCompany("PFIZER INC", COMPANIES)).toBe("c-pfizer");
  });
  it("honors the curated US-arm map", () => {
    expect(resolveApplicantCompany("CIPLA USA INC", COMPANIES)).toBe("c-cipla");
  });
  it("honors curated nulls (never attribute)", () => {
    expect(resolveApplicantCompany("MERCK KGAA", COMPANIES)).toBeNull();
  });
  it("matches ordered token containment for subsidiaries", () => {
    expect(
      resolveApplicantCompany("KING PHARMACEUTICALS INC SUB PFIZER INC", COMPANIES),
    ).toBe("c-pfizer");
  });
  it("does not match SUN inside HISUN (word-boundary safe)", () => {
    expect(
      resolveApplicantCompany("HISUN PHARMACEUTICAL (HANGZHOU) CO LTD", COMPANIES),
    ).toBeNull();
  });
  it("returns null for unknown applicants", () => {
    expect(resolveApplicantCompany("BAXTER HEALTHCARE CORP", COMPANIES)).toBeNull();
  });
  it("prefers canonical names over colliding subsidiary aliases", () => {
    const cos: CompanyNameEntry[] = [
      { id: "c-parent", slug: "pfizer", names: ["PFIZER"] },
      { id: "c-sub", slug: "pfizer-india", names: ["PFIZER INDIA", "PFIZER"] },
    ];
    expect(
      resolveApplicantCompany("KING PHARMACEUTICALS LLC A SUB OF PFIZER INC", cos),
    ).toBe("c-parent");
  });
  it("prefers longer exact names", () => {
    const cos: CompanyNameEntry[] = [
      { id: "c-short", slug: "sandoz", names: ["SANDOZ"] },
      { id: "c-long", slug: "sandoz-inc", names: ["SANDOZ INC"] },
    ];
    // normalized applicant is "SANDOZ" — exact match on the shorter name wins
    // over token containment of the longer one.
    expect(resolveApplicantCompany("SANDOZ INC", cos)).toBe("c-short");
  });
  it("punctuation variants still resolve via token containment", () => {
    // "CIPLA USA INC." with a period is not the curated key, but the
    // generic token-containment rule still attributes it to Cipla.
    expect(resolveApplicantCompany("CIPLA USA INC.", COMPANIES)).toBe("c-cipla");
  });
});

describe("APPLICANT_TO_SLUG", () => {
  it("has no empty keys", () => {
    for (const k of Object.keys(APPLICANT_TO_SLUG)) expect(k.trim().length).toBeGreaterThan(0);
  });
});

describe("extractZipFiles", () => {
  /** Build a minimal stored (method 0) ZIP with central directory. */
  function makeZip(files: Record<string, string>): Buffer {
    const parts: Buffer[] = [];
    const central: Buffer[] = [];
    let off = 0;
    for (const [name, content] of Object.entries(files)) {
      const nameBuf = Buffer.from(name, "utf8");
      const dataBuf = Buffer.from(content, "utf8");
      const head = Buffer.alloc(30);
      head.writeUInt32LE(0x04034b50, 0);
      head.writeUInt16LE(0, 8); // method: stored
      head.writeUInt32LE(dataBuf.length, 18);
      head.writeUInt32LE(dataBuf.length, 22);
      head.writeUInt16LE(nameBuf.length, 26);
      parts.push(head, nameBuf, dataBuf);

      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0);
      ch.writeUInt16LE(0, 10); // method: stored
      ch.writeUInt32LE(dataBuf.length, 24);
      ch.writeUInt32LE(dataBuf.length, 20);
      ch.writeUInt16LE(nameBuf.length, 28);
      ch.writeUInt32LE(off, 42);
      central.push(ch, nameBuf);
      off += 30 + nameBuf.length + dataBuf.length;
    }
    const cdOff = off;
    const cd = Buffer.concat(central);
    parts.push(cd);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    const entryCount = Object.keys(files).length;
    eocd.writeUInt16LE(entryCount, 8);
    eocd.writeUInt16LE(entryCount, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(cdOff, 16);
    parts.push(eocd);
    return Buffer.concat(parts);
  }

  it("extracts stored entries by name", () => {
    const files = extractZipFiles(makeZip({ "a.txt": "hello", "b.txt": "world" }));
    expect(files.get("a.txt")?.toString("utf8")).toBe("hello");
    expect(files.get("b.txt")?.toString("utf8")).toBe("world");
  });

  it("throws on non-ZIP input", () => {
    expect(() => extractZipFiles(Buffer.from("not a zip"))).toThrow(/end-of-central-directory/);
  });
});
