import "./load-env";
import { getConfig } from "./config";
import { log } from "./logger";
import { postIngest, type IngestRequest } from "./ingest";
import {
  pickScenario,
  scenarioToIngestRequest,
  resolveGangId,
  type Scenario,
} from "./scenarios";
import {
  fuseRecent,
  type FusionCluster,
  severityFor,
} from "./fusion";
import { putPatternPage, putIntelNotePage } from "./gbrain";
import { rankAndFilter, type RankedCluster } from "./funnel";
import { enrichCluster, regionHint, type EnrichedIncident } from "./enrich";
import { callBudget } from "./budget";

/**
 * One pass of "look for something worth ingesting, post it." Used by:
 *
 *   1. The long-running worker loop (calls every INTERVAL_S)
 *   2. The `pnpm --filter @caltrans/openclaw-worker tick` one-shot for
 *      Vercel cron and CI smoke tests.
 *
 * Mode logic:
 *   - `scripted`: fire the scenario for the current minute. Idempotent
 *     because /api/openclaw/ingest does its own dedupe-via-decisions and
 *     the worker uses minute-rounded scenario keys.
 *   - `fusion`:   query recent signal_events, cluster them, emit one
 *     incident per new cluster.
 *   - `both`:     run fusion first; if no new clusters, fall back to
 *     scripted so the dispatcher view never goes quiet.
 */

export interface TickResult {
  mode: "scripted" | "fusion" | "both";
  scripted_fired: number;
  clusters_seen: number;
  clusters_qualified: number;
  enriched: number;
  incidents_posted: number;
  pattern_pages_written: number;
  intel_pages_written: number;
}

// Process-local dedupe so the same scenario or fusion cluster isn't re-posted
// every tick. Keys auto-expire after 2 * INTERVAL_S so re-runs after a restart
// are clean.
const emittedAt = new Map<string, number>();

function shouldEmit(key: string, ttlMs: number): boolean {
  const last = emittedAt.get(key);
  if (last && Date.now() - last < ttlMs) return false;
  emittedAt.set(key, Date.now());
  // Best-effort cleanup of old entries.
  if (emittedAt.size > 256) {
    for (const [k, ts] of emittedAt) {
      if (Date.now() - ts > ttlMs * 4) emittedAt.delete(k);
    }
  }
  return true;
}

export async function runTick(): Promise<TickResult> {
  const cfg = getConfig();
  const result: TickResult = {
    mode: cfg.WORKER_MODE,
    scripted_fired: 0,
    clusters_seen: 0,
    clusters_qualified: 0,
    enriched: 0,
    incidents_posted: 0,
    pattern_pages_written: 0,
    intel_pages_written: 0,
  };
  // TTL must be at least the fusion bucket size (5 min) so a stable
  // location-based fusionKey doesn't re-emit within the same bucket as the
  // cluster grows.
  const ttlMs = Math.max(cfg.INTERVAL_S * 2, 360) * 1000;

  if (cfg.WORKER_MODE === "fusion" || cfg.WORKER_MODE === "both") {
    const clusters = await fuseRecent();
    result.clusters_seen = clusters.length;

    // Funnel: deterministic priority filter BEFORE any LLM call.
    const ranked = rankAndFilter(clusters);
    result.clusters_qualified = ranked.length;
    log.info({
      scope: "tick.funnel",
      msg: "ranked clusters",
      extra: {
        seen: clusters.length,
        qualified: ranked.length,
        budget: callBudget.snapshot(),
      },
    });

    let llmCallsThisTick = 0;
    for (const r of ranked) {
      const { cluster } = r;
      if (!shouldEmit(`fusion:${cluster.fusionKey}`, ttlMs)) continue;
      try {
        const enriched = await enrichCluster(cluster, llmCallsThisTick);
        if (!enriched) {
          // No Claude analysis = no incident emitted. We'd rather skip than
          // post a "Fused incident — N signals" stub. The cluster will
          // get another chance on the next tick if it's still around.
          log.info({
            scope: "tick",
            msg: "skipping cluster — no Claude description available",
            extra: { fusion_key: cluster.fusionKey, priority: r.priority },
          });
          continue;
        }
        llmCallsThisTick++;
        result.enriched++;
        await emitFusionIncident(cluster, r, enriched, result);
      } catch (err) {
        log.error({
          scope: "tick",
          msg: "fusion emit failed",
          extra: {
            fusion_key: cluster.fusionKey,
            err: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  }

  if (
    cfg.WORKER_MODE === "scripted" ||
    (cfg.WORKER_MODE === "both" && result.incidents_posted === 0)
  ) {
    const scenario = pickScenario();
    const key = `scripted:${scenario.key}:${Math.floor(Date.now() / 60_000)}`;
    if (shouldEmit(key, 55_000)) {
      try {
        await emitScenario(scenario, result);
      } catch (err) {
        log.error({
          scope: "tick",
          msg: "scripted emit failed",
          extra: {
            scenario: scenario.key,
            err: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  }

  return result;
}

async function emitScenario(scenario: Scenario, result: TickResult): Promise<void> {
  const cfg = getConfig();
  const req = await scenarioToIngestRequest(scenario);
  const resp = await postIngest(req);
  result.scripted_fired++;
  result.incidents_posted++;

  if (!cfg.GBRAIN_PAGES_ENABLED) return;

  // Companion intel_note → gbrain so the dispatcher's Prior Context surfaces
  // "OpenClaw saw this signal mix" even before a human decides.
  const intelBody = [
    `**Observed signals:** ${scenario.signals.length}`,
    "",
    ...scenario.signals.map(
      (s) => `- ${s.kind} · ${s.label}${s.confidence ? ` (conf ${s.confidence.toFixed(2)})` : ""}`,
    ),
    "",
    `**Severity:** ${scenario.severity}`,
    "",
    `_Posted to /api/openclaw/ingest as incident ${resp.incident_id}._`,
  ].join("\n");

  const gangId = scenario.gangAlias
    ? await resolveGangId(scenario.gangAlias)
    : null;
  await putIntelNotePage({
    noteId: `${scenario.key}-${resp.incident_id.slice(0, 8)}`,
    title: `OpenClaw: ${scenario.title}`,
    body: intelBody,
    tags: [
      `region:${slugify(extractRegion(scenario))}`,
      `severity:${scenario.severity}`,
      ...scenario.signals.map((s) => `signal:${s.kind.replace("_", "-")}`),
    ],
    relatedIncidentId: resp.incident_id,
    ...(gangId ? { relatedGangId: gangId } : {}),
  });
  result.intel_pages_written++;

  // Pattern page if signal mix is recurring (cam + 911 within 30s is the
  // canonical seed pattern). Upsert by mix-signature so repeated detections
  // accumulate in one row rather than spamming the KG.
  const hasCam = scenario.signals.some((s) => s.kind.startsWith("camera"));
  const has911 = scenario.signals.some((s) => s.kind === "call_911");
  if (hasCam && has911) {
    await putPatternPage({
      patternKey: "cam-911-coincidence",
      title: "Camera + 911 coincidence (≤90s window)",
      description:
        "OpenClaw worker observes camera detection paired with a 911 hangup or call within the fusion window. Historically these split 4-of-5 dismissed at known regulars locations — surface that prior in the dispatcher view before action.",
      tags: ["pattern:false_positive_candidate", "signal:cam-911"],
      region: extractRegion(scenario),
    });
    result.pattern_pages_written++;
  }
}

async function emitFusionIncident(
  cluster: FusionCluster,
  ranked: RankedCluster,
  enriched: EnrichedIncident | null,
  result: TickResult,
): Promise<void> {
  const cfg = getConfig();
  // If Claude enriched the cluster, prefer its title/severity/narrative.
  // Otherwise fall back to the deterministic rules from fusion.ts.
  const severity = enriched?.severity ?? severityFor(cluster);
  const sourceTypeList = Object.entries(cluster.sourceTypeCounts)
    .map(([k, v]) => `${v}×${k}`)
    .join(", ");

  const baseTitle = `Fused incident — ${cluster.members.length} signals (${sourceTypeList})`;
  const title = enriched?.title ?? baseTitle;

  const llmBlock = enriched
    ? [
        `**${enriched.title}**`,
        "",
        enriched.narrative,
        "",
        `_decision hint:_ **${enriched.decision_hint}**  ·  _enriched by claude (${cfg.LLM_MODEL})_`,
        "",
      ]
    : [];

  const notes = [
    ...llmBlock,
    `OpenClaw fused ${cluster.members.length} signals within ${cfg.FUSION_WINDOW_S}s / ${cfg.FUSION_RADIUS_M}m.`,
    `Earliest ${cluster.earliestAt.toISOString()}; latest ${cluster.latestAt.toISOString()}.`,
    `Funnel priority: ${ranked.priority} (${ranked.reasons.join(", ")})`,
    "",
    "Members:",
    ...cluster.members.map(
      (m) =>
        `- ${m.sourceType} · ${m.sourceId} · ${m.occurredAt.toISOString()} · conf=${m.confidence ?? "—"}`,
    ),
  ].join("\n");

  // Find nearest camera and (optionally) reuse an existing clip storage_path.
  const sql = (await import("./db")).getSql();
  const [camera] = await sql<
    Array<{ id: string; description: string }>
  >`
    SELECT id::text, description FROM cameras
    WHERE is_active = true
    ORDER BY (
      2 * 6371000 * asin(sqrt(
        sin(radians(${cluster.centroidLat} - lat) / 2) ^ 2 +
        cos(radians(lat)) * cos(radians(${cluster.centroidLat})) *
        sin(radians(${cluster.centroidLng} - lng) / 2) ^ 2
      ))
    ) ASC LIMIT 1
  `;
  if (!camera) {
    log.warn({
      scope: "tick",
      msg: "no camera found for fusion cluster — skipping",
      extra: { fusion_key: cluster.fusionKey },
    });
    return;
  }

  const [existingClip] = await sql<
    Array<{ storage_path: string; thumbnail_path: string }>
  >`
    SELECT storage_path, thumbnail_path FROM clips
    WHERE camera_id = ${camera.id}::uuid
    ORDER BY started_at DESC LIMIT 1
  `;

  const startedAt = cluster.earliestAt;
  const req: IngestRequest = {
    incident: {
      title,
      notes,
      severity,
      created_by: cfg.WORKER_USER_ID,
    },
    clips: [
      {
        camera_id: camera.id,
        started_at: startedAt.toISOString(),
        duration_s: Math.max(
          15,
          Math.min(
            120,
            Math.round(
              (cluster.latestAt.getTime() - cluster.earliestAt.getTime()) / 1000 + 30,
            ),
          ),
        ),
        storage_path:
          existingClip?.storage_path ?? `openclaw-fusion/${cluster.fusionKey}.mp4`,
        thumbnail_path:
          existingClip?.thumbnail_path ?? `openclaw-fusion/${cluster.fusionKey}.jpg`,
      },
    ],
  };

  const resp = await postIngest(req);
  result.incidents_posted++;
  log.info({
    scope: "tick",
    msg: "fusion incident posted",
    extra: {
      incident_id: resp.incident_id,
      fusion_key: cluster.fusionKey,
      severity,
      member_count: cluster.members.length,
    },
  });

  if (!cfg.GBRAIN_PAGES_ENABLED) return;
  await putIntelNotePage({
    noteId: cluster.fusionKey,
    title: enriched
      ? `OpenClaw 🤖 ${enriched.title}`
      : `OpenClaw fusion · ${cluster.members.length} signals`,
    body: notes,
    tags: [
      "fusion:auto",
      `severity:${severity}`,
      ...(enriched ? ["enriched:claude", `decision:${enriched.decision_hint}`] : []),
      ...(enriched?.tags ?? []),
      `region:${regionHint(cluster.centroidLat, cluster.centroidLng).replace(/\s+/g, "-")}`,
      ...Object.keys(cluster.sourceTypeCounts).map(
        (k) => `signal:${k.replace("_", "-")}`,
      ),
    ],
    relatedIncidentId: resp.incident_id,
  });
  result.intel_pages_written++;
}

function extractRegion(scenario: Scenario): string {
  // Cheap region inference from coordinates.
  const { lat, lng } = scenario;
  if (lat > 37.78 && lng < -122.4 && lng > -122.42) return "tenderloin";
  if (lat > 37.76 && lat < 37.78 && lng < -122.41 && lng > -122.43) return "mission";
  if (lat < 37.74 && lng > -122.39) return "bayview";
  if (lat > 37.78 && lng < -122.4) return "soma";
  if (lng < -122.46) return "outer-sunset";
  return "sf";
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// CLI entrypoint — `pnpm tick` runs one pass and exits.
const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  runTick()
    .then(async (r) => {
      log.info({ scope: "tick-cli", msg: "done", extra: { ...r } });
      const { closeDb } = await import("./db");
      await closeDb();
      process.exit(0);
    })
    .catch(async (err) => {
      log.error({
        scope: "tick-cli",
        msg: "failed",
        extra: { err: err instanceof Error ? err.message : String(err) },
      });
      const { closeDb } = await import("./db");
      await closeDb();
      process.exit(1);
    });
}
