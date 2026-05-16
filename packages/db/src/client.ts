import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDb(connectionString: string) {
  const queryClient = postgres(connectionString, { prepare: false });
  return drizzle(queryClient, { schema });
}

export type Db = ReturnType<typeof createDb>;
