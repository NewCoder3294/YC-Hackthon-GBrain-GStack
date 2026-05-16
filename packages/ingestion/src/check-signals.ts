/**
 * Ingestion sanity check — counts signal_events by source_type and
 * shows the most recent few. Useful before/during the demo to prove
 * Hari's producers actually landed rows.
 *
 *   pnpm --filter @caltrans/ingestion db:stats
 */

import "./load-env";
import { signalEvents } from "@caltrans/db";
import { sql, desc } from "drizzle-orm";
import { dbFromEnv } from "./db";
import { createLogger } from "./logger";

const log = createLogger("db:stats");

async function main(): Promise<void> {
  const db = dbFromEnv();

  const byType = await db
    .select({
      sourceType: signalEvents.sourceType,
      count: sql<number>`count(*)::int`,
    })
    .from(signalEvents)
    .groupBy(signalEvents.sourceType);

  const recent = await db
    .select({
      sourceType: signalEvents.sourceType,
      sourceId: signalEvents.sourceId,
      occurredAt: signalEvents.occurredAt,
      confidence: signalEvents.confidence,
    })
    .from(signalEvents)
    .orderBy(desc(signalEvents.ingestedAt))
    .limit(5);

  log.info("signal_events by source_type", { byType });
  log.info("most recent 5", { recent });
  process.exit(0);
}

main().catch((err: unknown) => {
  log.error("stats failed", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
