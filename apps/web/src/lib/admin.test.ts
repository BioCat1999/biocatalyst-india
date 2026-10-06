import { NextRequest } from "next/server";
import { describe, expect, it, vi, afterEach } from "vitest";
import { isAdminRequest } from "./admin";

function reqWithAuth(auth: string | null): NextRequest {
  const headers = new Headers();
  if (auth) headers.set("authorization", auth);
  return new NextRequest("http://localhost/api/v1/admin/ingestion/run", { headers });
}

describe("isAdminRequest", () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...origEnv };
    vi.unstubAllEnvs();
  });

  it("allows everything in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADMIN_TOKEN", "");
    expect(isAdminRequest(reqWithAuth(null))).toBe(true);
  });

  it("denies in production with no token configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_TOKEN", "");
    expect(isAdminRequest(reqWithAuth(null))).toBe(false);
    expect(isAdminRequest(reqWithAuth("Bearer anything"))).toBe(false);
  });

  it("allows a correct Bearer token in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_TOKEN", "s3cret-token");
    expect(isAdminRequest(reqWithAuth("Bearer s3cret-token"))).toBe(true);
  });

  it("denies wrong, empty, or malformed credentials", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_TOKEN", "s3cret-token");
    expect(isAdminRequest(reqWithAuth("Bearer wrong"))).toBe(false);
    expect(isAdminRequest(reqWithAuth("Bearer "))).toBe(false);
    expect(isAdminRequest(reqWithAuth("s3cret-token"))).toBe(false);
    expect(isAdminRequest(reqWithAuth(null))).toBe(false);
  });
});
