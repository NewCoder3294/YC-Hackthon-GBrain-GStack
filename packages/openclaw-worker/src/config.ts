import "./load-env";
import { z } from "zod";

/**
 * Runtime config for the OpenClaw worker. All knobs come from env so the
 * same binary can run as a local demo loop, as a Vercel cron tick, or
 * pointed at staging.
 *
 * Worker modes:
 *   `fusion` (default) — read recent `signal_events` and emit one incident
 *                per spatial+temporal cluster that hasn't been seen before.
 *                The "moving forward" mode. If signal_events is empty,
 *                the worker idles silently — which is correct: nothing to
 *                report when nothing is happening.
 *   `scripted` — fire pre-authored scenarios on `INTERVAL_S`. Kept as an
 *                explicit opt-in for offline dev only. Do NOT run this in
 *                shared environments; the dispatcher view should reflect
 *                real ingestion only.
 *   `both`     — fusion first; scripted only if fusion produces nothing.
 *                Useful while bootstrapping the ingestion pipeline. Same
 *                opt-in warning as `scripted`.
 */
const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  INGEST_URL: z
    .string()
    .url()
    .default("http://localhost:3000/api/openclaw/ingest"),
  CRON_SECRET: z.string().min(1),
  WORKER_MODE: z.enum(["scripted", "fusion", "both"]).default("fusion"),
  INTERVAL_S: z.coerce.number().int().positive().default(45),
  FUSION_WINDOW_S: z.coerce.number().int().positive().default(90),
  FUSION_RADIUS_M: z.coerce.number().int().positive().default(300),
  FUSION_MIN_SIGNALS: z.coerce.number().int().min(1).default(2),
  /** UUID of the "openclaw-worker" Supabase Auth user that owns ingested incidents. */
  WORKER_USER_ID: z
    .string()
    .uuid()
    .default("00000000-0000-0000-0000-000000000001"),
  /** When true, write companion gbrain pages (pattern, intel_note) per the handoff doc. */
  GBRAIN_PAGES_ENABLED: z.coerce.boolean().default(true),
  /** Tag every emitted page with this source — matches Nick's `source_id='watchdog'` convention. */
  GBRAIN_SOURCE_ID: z.string().min(1).default("watchdog"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type WorkerConfig = z.infer<typeof configSchema>;

let cached: WorkerConfig | null = null;

export function getConfig(): WorkerConfig {
  if (cached) return cached;
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`OpenClaw worker config invalid:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
