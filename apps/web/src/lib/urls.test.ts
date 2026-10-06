import { describe, expect, it } from "vitest";
import { trialUrl } from "./urls";

describe("trialUrl", () => {
  it("percent-encodes slashes in CTRI trial IDs so they stay in one path segment", () => {
    expect(trialUrl({ registry: "CTRI", registryTrialId: "CTRI/2024/08/071902" })).toBe(
      "/trials/CTRI/CTRI%2F2024%2F08%2F071902"
    );
  });

  it("round-trips through decodeURIComponent back to the canonical ID", () => {
    const id = "CTRI/2024/08/071902";
    const url = trialUrl({ registry: "CTRI", registryTrialId: id });
    const encoded = url.split("/trials/CTRI/")[1];
    expect(decodeURIComponent(encoded)).toBe(id);
  });

  it("leaves slash-free IDs untouched", () => {
    expect(trialUrl({ registry: "ClinicalTrials.gov", registryTrialId: "NCT06421387" })).toBe(
      "/trials/ClinicalTrials.gov/NCT06421387"
    );
  });
});
