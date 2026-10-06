/**
 * Milestone 8 — backup/restore script smoke tests (spec §20).
 *
 * Runs each script with --help (usage text, exit 0) and --dry-run (prints the
 * planned commands without touching a database or requiring pg_dump on PATH).
 * Restore --dry-run gets a scratch backup dir with a placeholder .dump file.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const REPO_ROOT = new URL("../../../..", import.meta.url).pathname;

function script(name: string): string {
  return join(REPO_ROOT, "scripts", name);
}

describe("db-backup.sh", () => {
  it("--help prints usage and exits 0", async () => {
    const { stdout } = await execFileAsync("bash", [script("db-backup.sh"), "--help"]);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("--dry-run");
  });

  it("--dry-run prints the pg_dump plan without needing a database", async () => {
    const { stdout } = await execFileAsync("bash", [
      script("db-backup.sh"),
      "--dry-run",
      "--db",
      "biocatalyst_test",
    ]);
    expect(stdout).toContain("pg_dump -Fc");
    expect(stdout).toContain("biocatalyst_test.dump");
  });
});

describe("db-restore.sh", () => {
  it("--help prints usage and exits 0", async () => {
    const { stdout } = await execFileAsync("bash", [script("db-restore.sh"), "--help"]);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("--target-db");
  });

  it("--dry-run prints the pg_restore plan without needing a database", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bc-restore-"));
    writeFileSync(join(dir, "biocatalyst_test.dump"), "placeholder");
    const { stdout } = await execFileAsync("bash", [
      script("db-restore.sh"),
      "--dry-run",
      "--backup",
      dir,
    ]);
    expect(stdout).toContain("pg_restore");
    expect(stdout).toContain("biocatalyst_test_restore_verify");
  });

  it("requires --backup", async () => {
    await expect(execFileAsync("bash", [script("db-restore.sh"), "--dry-run"])).rejects.toThrow();
  });
});
