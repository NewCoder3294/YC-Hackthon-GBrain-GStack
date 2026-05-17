/**
 * Worker env bootstrap. Imported first by every worker entrypoint.
 *
 * The standalone workers reuse the project's env file (produced by
 * `vercel env pull`). We use the `dotenv` parser rather than Node's
 * `--env-file` because dotenv reliably handles the quoted format
 * `vercel env pull` emits, which Node's built-in parser does not.
 *
 * We search every standard location (repo root and apps/web, `.env`
 * and `.env.local`) so it does not matter which one holds the real
 * values. $ENV_FILE overrides the search. Missing files are
 * non-fatal and real shell env always wins (override: false), so
 * inline `DATABASE_URL=... pnpm ...` keeps working.
 *
 * A non-secret diagnostic is written to stderr (file path + booleans
 * only — never values) so env wiring can be verified without
 * inspecting the file.
 */

import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../.."); // packages/ingestion/src -> root

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
    scope: "load-env",
    msg: "env bootstrap",
    extra: {
      loaded: found.map((p) => p.replace(repoRoot, ".")),
      checked: candidates.map((p) => p.replace(repoRoot, ".")),
      present: {
        DATABASE_URL: has("DATABASE_URL"),
        NEXT_PUBLIC_SUPABASE_URL: has("NEXT_PUBLIC_SUPABASE_URL"),
        SUPABASE_SERVICE_ROLE_KEY: has("SUPABASE_SERVICE_ROLE_KEY"),
        ANTHROPIC_API_KEY: has("ANTHROPIC_API_KEY"),
      },
    },
  })}\n`,
);
