import { closePool, getPool, migrate } from "@biocatalyst/db";

// Database migrations are a deployment responsibility. Running them before
// `next build` keeps migration files out of serverless request bundles while
// ensuring new application code never reaches production before its schema.
const pool = getPool();
try {
  const applied = await migrate(pool);
  console.log(
    applied.length === 0
      ? "migrations: already up to date"
      : `migrations: applied ${applied.join(", ")}`,
  );
} finally {
  await closePool();
}
