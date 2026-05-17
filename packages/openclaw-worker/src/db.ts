import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@caltrans/db";
import { getConfig } from "./config";

/**
 * Two clients off the same connection:
 *
 *   `db` — drizzle, used for typed reads of signal_events / cameras / incidents.
 *   `sql` — raw postgres-js, used for tables outside drizzle's schema (the
 *           gbrain `pages` / `tags` / `links` tables that Nick created
 *           directly in Supabase per GBRAIN_HANDOFF.md — they intentionally
 *           are not in `packages/db/src/schema.ts`).
 *
 * The pooler runs in transaction mode (port 6543) so we disable prepared
 * statements, same convention as gbrain itself.
 */

let _sql: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function ensure(): { sql: ReturnType<typeof postgres>; db: ReturnType<typeof drizzle<typeof schema>> } {
  if (_sql && _db) return { sql: _sql, db: _db };
  const cfg = getConfig();
  _sql = postgres(cfg.DATABASE_URL, { prepare: false });
  _db = drizzle(_sql, { schema });
  return { sql: _sql, db: _db };
}

export function getSql() {
  return ensure().sql;
}

export function getDb() {
  return ensure().db;
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
    _db = null;
  }
}
