import { dedupeEventText } from "../text";

describe("dedupeEventText", () => {
  it("drops the fact when the summary contains it (the reported repetition)", () => {
    const fact =
      "Torrent Pharmaceuticals announced first-patient dosing in the Phase 2 study of TRP-GLP1.";
    const summary =
      "Torrent Pharmaceuticals announced first-patient dosing in the Phase 2 study of TRP-GLP1, " +
      "its investigational oral GLP-1 receptor agonist for type 2 diabetes. The 260-patient study " +
      "will evaluate change in HbA1c at week 24.";
    const out = dedupeEventText(fact, summary);
    expect(out.fact).toBeNull();
    expect(out.summary).toBe(summary);
  });

  it("trims a partial tail/head overlap from the summary", () => {
    const fact = "Sun Pharma received FDA approval for its psoriasis drug";
    const summary = "for its psoriasis drug after a three-year review process.";
    const out = dedupeEventText(fact, summary);
    expect(out.fact).toBe(fact);
    expect(out.summary).toBe("after a three-year review process.");
  });

  it("drops the summary when the fact already contains it", () => {
    const fact = "Cipla launched a new inhaler. It will be sold across India.";
    const out = dedupeEventText(fact, "Cipla launched a new inhaler.");
    expect(out.fact).toBe(fact);
    expect(out.summary).toBe("");
  });

  it("keeps both when there is no overlap", () => {
    const out = dedupeEventText("FDA approval granted.", "The trial enrolled 260 patients.");
    expect(out.fact).toBe("FDA approval granted.");
    expect(out.summary).toBe("The trial enrolled 260 patients.");
  });

  it("handles empty inputs", () => {
    expect(dedupeEventText("", "Some summary.")).toEqual({ fact: null, summary: "Some summary." });
    expect(dedupeEventText("Some fact.", "")).toEqual({ fact: "Some fact.", summary: "" });
    expect(dedupeEventText("", "")).toEqual({ fact: null, summary: "" });
  });

  it("treats identical texts as one", () => {
    expect(dedupeEventText("Same text.", "Same text.")).toEqual({ fact: null, summary: "Same text." });
  });
});
