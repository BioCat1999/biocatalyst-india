import { formatDate, formatPct, parseWatchlistHref } from "../format";

describe("formatDate", () => {
  it("formats ISO timestamps as 'D Mon YYYY'", () => {
    expect(formatDate("2026-09-29T10:00:00.000Z")).toBe("29 Sep 2026");
  });
  it("falls back for null/invalid input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatPct", () => {
  it("signs positive values and handles null", () => {
    expect(formatPct(2.44)).toBe("+2.4%");
    expect(formatPct(-1.16)).toBe("-1.2%");
    expect(formatPct(0)).toBe("0.0%");
    expect(formatPct(null)).toBe("—");
    expect(formatPct(undefined)).toBe("—");
  });
});

describe("parseWatchlistHref", () => {
  it("parses company and drug hrefs", () => {
    expect(parseWatchlistHref("/companies/sun-pharma")).toEqual({ kind: "company", slug: "sun-pharma" });
    expect(parseWatchlistHref("/drugs/demomab")).toEqual({ kind: "drug", slug: "demomab" });
  });
  it("rejects missing or unexpected hrefs", () => {
    expect(parseWatchlistHref(null)).toBeNull();
    expect(parseWatchlistHref("/events/123")).toBeNull();
    expect(parseWatchlistHref("https://evil.example/x")).toBeNull();
  });
});
