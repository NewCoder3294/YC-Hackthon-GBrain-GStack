/**
 * One-shot migration applier (hackathon convenience).
 *
 * The repo applies SQL migrations manually (0001_rls.sql, 0002 are not
 * in the drizzle journal). This runs a migration file through the
 * worker's Postgres connection so nobody has to copy-paste SQL into the
 * Supabase dashboard. Idempotent — the SQL uses IF NOT EXISTS / DO
 * blocks, so re-running is safe.
 *
 *   pnpm --filter @caltrans/ingestion db:apply [migrationFile]
 *
 * Defaults to 0002_signal_events.sql. Requires DATABASE_URL (loaded
 * from apps/web/.env.local via load-env).
 */

import "../load-env";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { sql } from "drizzle-orm";
import { dbFromEnv } from "./db";
import { createLogger } from "./logger";

const log = createLogger("db:apply");

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, "../../..");
  const arg = process.argv[2] ?? "0002_signal_events.sql";
  const migrationPath = resolve(repoRoot, "packages/db/migrations", arg);

  const raw = readFileSync(migrationPath, "utf8");
  // drizzle separates statements with this marker
  const statements = raw
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  log.info("Applying migration", {
    file: arg,
    statements: statements.length,
  });

  const db = dbFromEnv();
  let applied = 0;
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt));
    applied += 1;
    log.info(`statement ${applied}/${statements.length} ok`);
  }

  log.info("Migration applied", { file: arg, applied });
  process.exit(0);
}

main().catch((err: unknown) => {
  log.error("Migration failed", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
