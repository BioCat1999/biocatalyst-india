import { formatDate, formatPct, formatRelative, parseWatchlistHref } from "../format";

describe("formatDate", () => {
  it("formats ISO timestamps as 'D Mon YYYY'", () => {
    expect(formatDate("2026-09-29T10:00:00.000Z")).toBe("29 Sep 2026");
  });
  it("falls back for null/invalid input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-10-27T12:00:00.000Z");
  it("uses short relative labels for the last week", () => {
    expect(formatRelative("2026-10-27T11:59:40.000Z", now)).toBe("Just now");
    expect(formatRelative("2026-10-27T11:55:00.000Z", now)).toBe("5m ago");
    expect(formatRelative("2026-10-27T09:00:00.000Z", now)).toBe("3h ago");
    expect(formatRelative("2026-10-25T12:00:00.000Z", now)).toBe("2d ago");
  });
  it("falls back to a date for older or future timestamps", () => {
    expect(formatRelative("2026-09-29T10:00:00.000Z", now)).toBe("29 Sep 2026");
    expect(formatRelative("2026-11-01T10:00:00.000Z", now)).toBe("1 Nov 2026");
    expect(formatRelative(null, now)).toBe("—");
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
