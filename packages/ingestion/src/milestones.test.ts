import { describe, expect, it } from "vitest";
import { extractRegulatoryMilestones } from "./milestones.js";

describe("extractRegulatoryMilestones", () => {
  it("extracts an explicit PDUFA target date", () => {
    expect(extractRegulatoryMilestones(
      "The FDA assigned a PDUFA target action date of March 18, 2027 for the application.",
      "Example Bio",
    )).toEqual([expect.objectContaining({ kind: "pdufa", date: "2027-03-18", status: "confirmed" })]);
  });

  it("does not invent dates from vague guidance", () => {
    expect(extractRegulatoryMilestones("A decision is expected in the second half of 2027.", "Example Bio")).toEqual([]);
  });
});
