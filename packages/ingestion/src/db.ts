/**
 * Worker DB bootstrap. The Caltrans detector and 911 generator are
 * standalone Node processes (not Next.js), so they connect with the
 * service-role DATABASE_URL directly via @caltrans/db.
 */

import { createDb, type Db } from "@caltrans/db";

export function dbFromEnv(): Db {
  const url = process.env.DATABASE_URL;
  if (!url || url.length === 0) {
    throw new Error(
      "DATABASE_URL is required. Run `npx vercel env pull apps/web/.env.local` " +
        "then export it, or pass it inline for the worker.",
    );
  }
  return createDb(url);
}
