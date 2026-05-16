import { z } from "zod";
import { getConfig } from "./config";
import { log } from "./logger";

/**
 * Client for `POST /api/openclaw/ingest` — the contract Nick exposed in
 * `apps/web/app/api/openclaw/ingest/route.ts`. Returns the dispatcher view's
 * incident_id and the count of predictive alerts that fired downstream.
 *
 * Retries on 5xx/network with small backoff so a transient blip during the
 * demo doesn't drop a signal.
 */

export const ingestClipSchema = z.object({
  caltrans_id: z.string().optional(),
  camera_id: z.string().uuid().optional(),
  started_at: z.string(),
  duration_s: z.number().int().positive(),
  storage_path: z.string(),
  thumbnail_path: z.string(),
});

export const ingestIncidentSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(4000).optional(),
  severity: z.enum(["low", "med", "high"]).default("low"),
  created_by: z.string().uuid(),
  suspect_gang_id: z.string().uuid().optional(),
});

export const ingestRequestSchema = z.object({
  incident: ingestIncidentSchema,
  clips: z.array(ingestClipSchema).min(1),
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;

export interface IngestResponse {
  ok: true;
  incident_id: string;
  clips: number;
  new_alerts: number;
}

interface IngestError {
  error: string;
  detail?: string;
  status: number;
}

const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 750;

export async function postIngest(req: IngestRequest): Promise<IngestResponse> {
  const cfg = getConfig();
  // Validate at the boundary — a malformed payload will be caught here, not
  // by the server (which returns a generic 400).
  const parsed = ingestRequestSchema.parse(req);

  let attempt = 0;
  let lastErr: unknown = null;

  while (attempt <= MAX_RETRIES) {
    attempt++;
    try {
      const res = await fetch(cfg.INGEST_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.CRON_SECRET}`,
        },
        body: JSON.stringify(parsed),
      });

      if (res.ok) {
        const json = (await res.json()) as IngestResponse;
        log.info({
          scope: "ingest",
          msg: "incident posted",
          extra: {
            incident_id: json.incident_id,
            clips: json.clips,
            new_alerts: json.new_alerts,
            attempt,
          },
        });
        return json;
      }

      // 4xx — don't retry; the request is bad.
      if (res.status < 500) {
        const body = (await res.json().catch(() => ({}))) as Partial<IngestError>;
        throw new Error(
          `ingest 4xx (${res.status}): ${body.error ?? "unknown"} — ${body.detail ?? ""}`,
        );
      }

      // 5xx — retry.
      lastErr = new Error(`ingest 5xx (${res.status})`);
    } catch (err) {
      lastErr = err;
    }

    if (attempt <= MAX_RETRIES) {
      log.warn({
        scope: "ingest",
        msg: "transient failure, retrying",
        extra: { attempt, err: lastErr instanceof Error ? lastErr.message : String(lastErr) },
      });
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * attempt));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("ingest failed");
}
