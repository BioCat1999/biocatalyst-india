/**
 * Provider selection tests — Milestone 4.
 *
 * `MODEL_PROVIDER` selects the extraction provider; the default is the
 * offline deterministic extractor, and unknown values degrade to it with
 * a warning. No provider requires API keys or network access.
 */
import { afterEach, describe, expect, it } from "vitest";
import { MODEL_PROVIDER_ENV, providerNameFromEnv, selectProvider } from "./provider.js";
import { DeterministicExtractor } from "./providers/deterministic.js";
import { MockModelProvider } from "./providers/mock.js";

const ORIGINAL = process.env[MODEL_PROVIDER_ENV];

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env[MODEL_PROVIDER_ENV];
  else process.env[MODEL_PROVIDER_ENV] = ORIGINAL;
});

describe("providerNameFromEnv", () => {
  it("defaults to deterministic when unset", () => {
    delete process.env[MODEL_PROVIDER_ENV];
    expect(providerNameFromEnv()).toBe("deterministic");
  });

  it("selects mock when MODEL_PROVIDER=mock", () => {
    process.env[MODEL_PROVIDER_ENV] = "mock";
    expect(providerNameFromEnv()).toBe("mock");
  });

  it("degrades unknown values to deterministic", () => {
    process.env[MODEL_PROVIDER_ENV] = "gpt-99";
    expect(providerNameFromEnv()).toBe("deterministic");
  });
});

describe("selectProvider", () => {
  it("returns the deterministic extractor by default", async () => {
    delete process.env[MODEL_PROVIDER_ENV];
    const provider = await selectProvider();
    expect(provider).toBeInstanceOf(DeterministicExtractor);
    expect(provider.providerName).toBe("deterministic");
  });

  it("returns the mock provider for MODEL_PROVIDER=mock", async () => {
    process.env[MODEL_PROVIDER_ENV] = "mock";
    const provider = await selectProvider();
    expect(provider).toBeInstanceOf(MockModelProvider);
    expect(provider.providerName).toBe("mock");
  });
});
