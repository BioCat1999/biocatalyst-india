import { describe, expect, it } from "vitest";
import { formatPct, mrClass, formatDate } from "./format";

describe("formatPct", () => {
  it("signs positive moves", () => expect(formatPct(4.81)).toBe("+4.81%"));
  it("keeps negative sign", () => expect(formatPct(-2.5)).toBe("-2.50%"));
  it("formats zero", () => expect(formatPct(0)).toBe("0.00%"));
});

describe("mrClass", () => {
  it("classifies up/down/flat", () => {
    expect(mrClass(1.2)).toBe("mr-up");
    expect(mrClass(-1.2)).toBe("mr-down");
    expect(mrClass(0.01)).toBe("mr-flat");
  });
});

describe("formatDate", () => {
  it("formats an ISO date in IST", () => {
    expect(formatDate("2026-09-29")).toContain("2026");
  });
});
