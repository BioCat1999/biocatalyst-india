/**
 * Tests for the openFDA adapter.
 *
 * The network is stubbed via an injected `fetch` — no network in tests.
 * Fixture payloads mirror the real openFDA JSON shapes (drugsfda and
 * enforcement endpoints).
 */
import { describe, expect, it, vi } from "vitest";
import {
  OpenFdaAdapter,
  FDA_SOURCE_NAME,
  fdaDateToIso,
  fdaSlashDateToIso,
} from "./fda.js";

function approvalFixture() {
  return {
    results: [
      {
        application_number: "NDA123456",
        sponsor_name: "Aurobindo Pharma Ltd",
        products: [
          {
            brand_name: "Testbrand",
            active_ingredients: [{ name: "TESTDRUG" }],
          },
        ],
        submissions: [
          {
            submission_type: "ANDA",
            submission_status: "AP",
            submission_status_date: "20260928",
          },
          {
            submission_type: "ANDA",
            submission_status: "TA",
            submission_status_date: "20250115",
          },
        ],
      },
      {
        // Unknown sponsor — dropped at normalize time (entity discipline).
        application_number: "NDA999999",
        sponsor_name: "Some Unknown Corp",
        products: [{ brand_name: "Mystery" }],
        submissions: [
          { submission_type: "NDA", submission_status: "AP", submission_status_date: "20260929" },
        ],
      },
    ],
  };
}

function recallFixture() {
  return {
    results: [
      {
        recall_number: "D-1234-2026",
        recalling_firm: "Lupin Ltd",
        product_description: "Test Tablets, 10mg",
        reason_for_recall: "Failed impurities specification",
        classification: "Class II",
        status: "Ongoing",
        recall_initiation_date: "20260925",
      },
      {
        recall_number: "D-9999-2026",
        recalling_firm: "Unknown Corp",
        product_description: "Something",
        classification: "Class I",
        recall_initiation_date: "20260926",
      },
    ],
  };
}

function shortageFixture() {
  return {
    results: [
      {
        package_ndc: "00001-0001",
        generic_name: "Cipla Test Injection",
        company_name: "Cipla Ltd",
        availability: "Limited Availability",
        status: "Current",
        update_type: "Updated",
        shortage_reason: "Demand increase for the drug",
        update_date: "09/30/2026",
        initial_posting_date: "09/30/2026",
      },
      {
        // Second package size of the same shortage — collapses into one event.
        package_ndc: "00001-0002",
        generic_name: "Cipla Test Injection",
        company_name: "Cipla Ltd",
        availability: "Limited Availability",
        status: "Current",
        update_type: "Updated",
        update_date: "09/30/2026",
        initial_posting_date: "09/30/2026",
      },
      {
        // Years-old shortage that FDA just re-verified — not news.
        package_ndc: "00002-0001",
        generic_name: "Old Shortage Tablet",
        company_name: "Cipla Ltd",
        availability: "Limited Availability",
        status: "Current",
        update_type: "Reverified",
        update_date: "09/30/2026",
        initial_posting_date: "12/15/2021",
      },
    ],
  };
}

function stubFetch() {
  return vi.fn(async (url: unknown) => {
    const u = String(url);
    const payload = u.includes("/drug/drugsfda.json")
      ? approvalFixture()
      : u.includes("/drug/shortages.json")
        ? shortageFixture()
        : recallFixture();
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("fdaDateToIso", () => {
  it("converts YYYYMMDD to ISO", () => {
    expect(fdaDateToIso("20260928")).toBe("2026-09-28T00:00:00.000Z");
  });
  it("converts MM/DD/YYYY shortage dates to ISO", () => {
    expect(fdaSlashDateToIso("9/30/2026")).toBe("2026-09-30T00:00:00.000Z");
  });
  it("returns null for garbage", () => {
    expect(fdaDateToIso(null)).toBeNull();
    expect(fdaDateToIso("not-a-date")).toBeNull();
  });
});

describe("OpenFdaAdapter", () => {
  it("treats openFDA's 404 no-results response as an empty successful window", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const adapter = new OpenFdaAdapter(fetchImpl);

    await expect(adapter.fetchSince("2026-10-01")).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("fetches approvals, recalls and shortages, advancing the cursor", async () => {
    const adapter = new OpenFdaAdapter(stubFetch());
    const docs = await adapter.fetchSince("2026-09-01");
    // 2 approvals + 2 recalls + 1 shortage
    expect(docs).toHaveLength(5);
    expect(adapter.getNextCursor()).toBe("2026-09-30");
    expect(adapter.sourceName).toBe(FDA_SOURCE_NAME);
  });

  it("normalizes an approval to regulatory_approval with the matched company", async () => {
    const adapter = new OpenFdaAdapter(stubFetch());
    const docs = await adapter.fetchSince("2026-09-01");
    const approvalDoc = docs.find((d) =>
      String(d.canonicalUrl).includes("NDA123456"),
    )!;
    const [c] = await adapter.normalize(approvalDoc);
    expect(c.eventType).toBe("regulatory_approval");
    expect(c.companyNames).toEqual(["Aurobindo Pharma Ltd"]);
    expect(c.headline).toContain("FDA approves Testbrand");
    expect(c.headline).toContain("ANDA");
    expect(c.confidence).toBe(0.9);
    expect(c.isPrimary).toBe(true);
    expect(c.occurredAt).toBe("2026-09-28T00:00:00.000Z");
  });

  it("drops approvals whose sponsor matches no tracked company", async () => {
    const adapter = new OpenFdaAdapter(stubFetch());
    const docs = await adapter.fetchSince("2026-09-01");
    const unknownDoc = docs.find((d) =>
      String(d.canonicalUrl).includes("NDA999999"),
    )!;
    expect(await adapter.normalize(unknownDoc)).toEqual([]);
  });

  it("maps a Class II recall to manufacturing_or_inspection_update", async () => {
    const adapter = new OpenFdaAdapter(stubFetch());
    const docs = await adapter.fetchSince("2026-09-01");
    const recallDoc = docs.find((d) =>
      String(d.canonicalUrl).includes("D-1234-2026"),
    )!;
    const [c] = await adapter.normalize(recallDoc);
    expect(c.eventType).toBe("manufacturing_or_inspection_update");
    expect(c.companyNames).toEqual(["Lupin Ltd"]);
    expect(c.confidence).toBe(0.85);
    expect(c.headline).toContain("Lupin");
  });

  it("maps a Class I recall to safety_signal", async () => {
    const adapter = new OpenFdaAdapter(vi.fn(async () => {
      return new Response(
        JSON.stringify({
          results: [
            {
              recall_number: "D-1111-2026",
              recalling_firm: "Cipla Ltd",
              product_description: "Eye drops",
              classification: "Class I",
              recall_initiation_date: "20260927",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch);
    const docs = await adapter.fetchSince("2026-09-27");
    // approval query returns the same stubbed recall payload shape — the
    // approval records have no submissions, so they are skipped; only the
    // recall record normalizes.
    const recallDoc = docs.find((d) => String(d.canonicalUrl).includes("D-1111-2026"))!;
    const [c] = await adapter.normalize(recallDoc);
    expect(c.eventType).toBe("safety_signal");
    expect(c.companyNames).toEqual(["Cipla Ltd"]);
  });

  it("drops label supplements but keeps new-indication approvals", async () => {
    const record = (subs: Record<string, string>[]) => ({
      application_number: "BLA761000",
      sponsor_name: "Aurobindo Pharma Ltd",
      products: [{ brand_name: "Testbrand", active_ingredients: [{ name: "TESTMAB" }] }],
      submissions: subs,
    });
    const fetchImpl = vi.fn(async (url: unknown) => {
      const u = String(url);
      const payload = u.includes("/drug/drugsfda.json")
        ? {
            results: [
              record([{ submission_type: "SUPPL", submission_class_code: "LABELING", submission_status: "AP", submission_status_date: "20260928" }]),
              { ...record([{ submission_type: "SUPPL", submission_class_code: "EFFICACY", submission_status: "AP", submission_status_date: "20260929" }]), application_number: "BLA761001" },
              { ...record([{ submission_type: "ORIG", submission_class_code: "UNKNOWN", submission_status: "AP", submission_status_date: "20260929" }]), application_number: "BLA761002" },
            ],
          }
        : { results: [] };
      return new Response(JSON.stringify(payload), { status: 200 });
    }) as unknown as typeof fetch;
    const adapter = new OpenFdaAdapter(fetchImpl);
    const docs = await adapter.fetchSince("2026-09-01");
    const heads = (await Promise.all(docs.map((d) => adapter.normalize(d)))).flat().map((c) => c.headline);
    expect(heads.some((h) => h.includes("BLA761000"))).toBe(false);
    expect(heads).toHaveLength(2);
    expect(heads).toContain("FDA approves new indication for Testbrand (TESTMAB)");
    expect(heads).toContain("FDA approves Testbrand (TESTMAB) — BLA");
  });

  it("maps a tracked unavailable product to drug_shortage", async () => {
    const adapter = new OpenFdaAdapter(stubFetch());
    const docs = await adapter.fetchSince("2026-09-01");
    const shortageDocs = docs.filter((d) => String(d.canonicalUrl).includes("shortages"));
    // One per company + medicine; the re-verified 2021 shortage is skipped.
    expect(shortageDocs).toHaveLength(1);
    const shortageDoc = shortageDocs[0]!;
    expect(String(shortageDoc.canonicalUrl)).toContain("Cipla%20Test%20Injection");
    const [c] = await adapter.normalize(shortageDoc);
    expect(c.eventType).toBe("drug_shortage");
    expect(c.companyNames).toEqual(["Cipla Ltd"]);
    expect(c.headline).toContain("Limited Availability");
    expect(c.factualSummary).toContain("Demand increase");
    expect(c.occurredAt).toBe("2026-09-30T00:00:00.000Z");
  });

  it("queries shortages by first-posted date, not update date", async () => {
    const fetchImpl = stubFetch();
    const adapter = new OpenFdaAdapter(fetchImpl);
    await adapter.fetchSince("2026-09-01");
    const shortageUrl = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => decodeURIComponent(String(c[0])))
      .find((u) => u.includes("/drug/shortages.json"))!;
    expect(shortageUrl).toContain("initial_posting_date:[2026-09-01 TO");
    expect(shortageUrl).toContain("sort=initial_posting_date:desc");
  });
});
