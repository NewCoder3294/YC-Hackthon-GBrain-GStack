/**
 * Worker env bootstrap. Imported first by every worker entrypoint.
 *
 * Same pattern as packages/ingestion/src/load-env.ts: load `apps/web/.env.local`
 * (or alternates) with dotenv so the worker can use the same DATABASE_URL /
 * SUPABASE_* / CRON_SECRET that the web app uses.
 *
 * `override: false` so a real shell env still wins — useful for overriding
 * INGEST_URL during a demo without editing the file.
 *
 * Non-secret diagnostic is written to stderr so env wiring can be checked
 * without inspecting the file.
 */

import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

const candidates = process.env.ENV_FILE
  ? [process.env.ENV_FILE]
  : [
      resolve(repoRoot, "apps/web/.env.local"),
      resolve(repoRoot, "apps/web/.env"),
      resolve(repoRoot, ".env.local"),
      resolve(repoRoot, ".env"),
    ];

const found = candidates.filter((p) => existsSync(p));
if (found.length > 0) {
  loadDotenv({ path: found, override: false });
}

const has = (k: string): boolean =>
  typeof process.env[k] === "string" && process.env[k]!.length > 0;

process.stderr.write(
  `${JSON.stringify({
    t: new Date().toISOString(),
    level: "info",
    scope: "openclaw-worker:load-env",
    msg: "env bootstrap",
    extra: {
      loaded: found.map((p) => p.replace(repoRoot, ".")),
      present: {
        DATABASE_URL: has("DATABASE_URL"),
        NEXT_PUBLIC_SUPABASE_URL: has("NEXT_PUBLIC_SUPABASE_URL"),
        SUPABASE_SERVICE_ROLE_KEY: has("SUPABASE_SERVICE_ROLE_KEY"),
        CRON_SECRET: has("CRON_SECRET"),
      },
    },
  })}\n`,
);
