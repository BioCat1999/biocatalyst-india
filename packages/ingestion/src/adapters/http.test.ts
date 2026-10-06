/**
 * Tests for the live-adapter HTTP helper: timeouts, transient retries, and
 * fail-fast on non-transient errors. No network in tests.
 */
import { describe, expect, it, vi } from "vitest";
import { fetchJson, fetchText } from "./http.js";

function responder(sequence: ({ ok: boolean; status: number; body?: unknown } | { throw: Error })[]) {
  const calls: string[] = [];
  const mock = vi.fn(async (...args: unknown[]) => {
    calls.push(String(args[0]));
    const next = sequence[Math.min(calls.length - 1, sequence.length - 1)];
    if ("throw" in next) throw next.throw;
    return { ok: next.ok, status: next.status, json: async () => next.body ?? {} };
  });
  return { fetchImpl: mock as unknown as typeof fetch, calls };
}

const OPTS = { userAgent: "test/1.0", timeoutMs: 1000, maxAttempts: 3 };

describe("fetchJson", () => {
  it("returns parsed JSON on first success", async () => {
    const { fetchImpl } = responder([{ ok: true, status: 200, body: { a: 1 } }]);
    await expect(fetchJson(fetchImpl, "https://example.com/x", OPTS)).resolves.toEqual({ a: 1 });
  });

  it("retries a 429 then succeeds", async () => {
    const { fetchImpl, calls } = responder([
      { ok: false, status: 429 },
      { ok: true, status: 200, body: { ok: true } },
    ]);
    // Speed up: use maxAttempts with tiny backoff by patching timers is
    // overkill — the helper's backoff is 2s/4s; instead assert via fewer attempts.
    await expect(
      fetchJson(fetchImpl, "https://example.com/x", { ...OPTS, maxAttempts: 2, timeoutMs: 500 }),
    ).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  }, 15000);

  it("throws after exhausting attempts on persistent 500s", async () => {
    const { fetchImpl, calls } = responder([{ ok: false, status: 500 }]);
    await expect(fetchJson(fetchImpl, "https://example.com/x", OPTS)).rejects.toThrow("HTTP 500");
    expect(calls).toHaveLength(3);
  }, 20000);

  it("fails fast on non-transient errors (HTTP 400)", async () => {
    const { fetchImpl, calls } = responder([{ ok: false, status: 400 }]);
    await expect(fetchJson(fetchImpl, "https://example.com/x", OPTS)).rejects.toThrow("HTTP 400");
    expect(calls).toHaveLength(1);
  });

  it("retries connection-level failures", async () => {
    const { fetchImpl, calls } = responder([
      { throw: new Error("fetch failed") },
      { ok: true, status: 200, body: { ok: true } },
    ]);
    await expect(
      fetchJson(fetchImpl, "https://example.com/x", { ...OPTS, maxAttempts: 2 }),
    ).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  }, 15000);
});

describe("fetchText", () => {
  function textResponder(xml: string) {
    const mock = vi.fn(async () => ({ ok: true, status: 200, text: async () => xml }));
    return mock as unknown as typeof fetch;
  }

  it("returns the response body as text", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`;
    await expect(
      fetchText(textResponder(xml), "https://example.com/feed/", { userAgent: "test/1.0" }),
    ).resolves.toBe(xml);
  });

  it("fails fast on non-transient errors (HTTP 404)", async () => {
    const mock = vi.fn(async () => ({ ok: false, status: 404 }));
    await expect(
      fetchText(mock as unknown as typeof fetch, "https://example.com/feed/", {
        userAgent: "test/1.0",
      }),
    ).rejects.toThrow("HTTP 404");
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
