import {
  cameras,
  cameraSurfaceHealth,
  cameraSurfaces,
  type Db,
  type NewCameraSurfaceHealth,
} from "@caltrans/db";
import { eq, inArray, sql } from "drizzle-orm";

export interface ProbeDeps {
  db: Db;
  fetch: typeof globalThis.fetch;
  concurrency?: number;
  timeoutMs?: number;
  // If the fraction of previously-active cameras now failing exceeds this,
  // assume a transient outage and skip writes. Default 0.5.
  abortThreshold?: number;
}

export interface ProbeResult {
  probed: number;
  dead: number;
  revived: number;
  aborted: boolean;
  durationMs: number;
}

const DEFAULTS = {
  concurrency: 20,
  timeoutMs: 6000,
  // Caltrans D4's CDN routinely 404s a large fraction of the URLs it
  // advertises. Keep the safety net for near-total egress outages, but do not
  // abort normal dead-stream cleanup.
  abortThreshold: 0.95,
} as const;

async function probeOne(
  url: string,
  doFetch: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await doFetch(url, {
      method: "GET",
      signal: ctl.signal,
      headers: { accept: "*/*", "user-agent": "watchdog-probe" },
    });
    // Cancel the body — for MJPEG this avoids downloading the image, for HLS
    // it avoids reading the (small) playlist twice. Status code is enough.
    try {
      await res.body?.cancel();
    } catch {
      // ignore — some runtimes throw when cancelling an already-closed body.
    }
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeCameraLiveness(deps: ProbeDeps): Promise<ProbeResult> {
  const concurrency = deps.concurrency ?? DEFAULTS.concurrency;
  const timeoutMs = deps.timeoutMs ?? DEFAULTS.timeoutMs;
  const abortThreshold = deps.abortThreshold ?? DEFAULTS.abortThreshold;
  const start = Date.now();

  // Probe every active surface. Camera-level product eligibility is derived
  // later by the visual validator; this probe only proves whether bytes are
  // reachable and keeps legacy `is_active` roughly compatible.
  const rows = await deps.db
    .select({
      id: cameraSurfaces.id,
      cameraId: cameraSurfaces.cameraId,
      kind: cameraSurfaces.kind,
      url: cameraSurfaces.url,
      isActive: cameras.isActive,
    })
    .from(cameraSurfaces)
    .innerJoin(cameras, eq(cameraSurfaces.cameraId, cameras.id))
    .where(eq(cameraSurfaces.isActive, true));

  if (rows.length === 0) {
    return {
      probed: 0,
      dead: 0,
      revived: 0,
      aborted: false,
      durationMs: Date.now() - start,
    };
  }

  type Probed = {
    id: string;
    cameraId: string;
    kind: string;
    wasActive: boolean;
    alive: boolean;
  };
  const results: Probed[] = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= rows.length) return;
      const row = rows[i]!;
      const alive = await probeOne(row.url, deps.fetch, timeoutMs);
      results.push({
        id: row.id,
        cameraId: row.cameraId,
        kind: row.kind,
        wasActive: row.isActive,
        alive,
      });
    }
  }
  const workerCount = Math.min(concurrency, rows.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const byCamera = new Map<string, Probed[]>();
  for (const result of results) {
    const group = byCamera.get(result.cameraId) ?? [];
    group.push(result);
    byCamera.set(result.cameraId, group);
  }
  const toDeactivate = Array.from(byCamera.entries())
    .filter(
      ([, group]) => group.some((r) => r.wasActive) && group.every((r) => !r.alive),
    )
    .map(([cameraId]) => cameraId);
  const toRevive = Array.from(byCamera.entries())
    .filter(([, group]) => group.some((r) => !r.wasActive && r.alive))
    .map(([cameraId]) => cameraId);
  const alive = results.filter((r) => r.alive);
  const activeCount = new Set(
    results.filter((r) => r.wasActive).map((r) => r.cameraId),
  ).size;
  const validatedAt = new Date();

  // Transient-outage safety net: if more than `abortThreshold` of previously-
  // active cameras suddenly fail in a single run, assume the worker's
  // egress is flaky and skip writes. Revivals are still safe to apply
  // because a successful HTTP response cannot be confused with an outage.
  const aborted =
    activeCount > 0 && toDeactivate.length / activeCount > abortThreshold;

  const healthRows: NewCameraSurfaceHealth[] = results
    .filter((r) => r.alive || !aborted)
    .map((r) => ({
      surfaceId: r.id,
      reachabilityStatus: r.alive ? "ok" : "failed",
      visualStatus: r.kind === "still" ? "unchecked" : "not_applicable",
      lastCheckedAt: validatedAt,
      error: r.alive ? null : "probe_failed",
      sampleMetadata: {},
    }));
  if (healthRows.length > 0) {
    await deps.db
      .insert(cameraSurfaceHealth)
      .values(healthRows)
      .onConflictDoUpdate({
        target: cameraSurfaceHealth.surfaceId,
        set: {
          reachabilityStatus: sql`excluded.reachability_status`,
          lastCheckedAt: sql`excluded.last_checked_at`,
          error: sql`excluded.error`,
        },
      });
  }

  if (alive.length > 0) {
    const CHUNK = 200;
    const ids = Array.from(new Set(alive.map((r) => r.cameraId)));
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      // Liveness only proves the URL returned HTTP bytes. The web validation
      // cron owns validation_status because it decodes frames and rejects
      // unavailable, black, or gray placeholders.
      await deps.db
        .update(cameras)
        .set({ isActive: true })
        .where(inArray(cameras.id, slice));
    }
  }

  if (!aborted && toDeactivate.length > 0) {
    const CHUNK = 200;
    const ids = toDeactivate;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      await deps.db
        .update(cameras)
        .set({
          isActive: false,
          productStatus: "hidden",
          validationStatus: "failed",
          lastValidatedAt: validatedAt,
          validationError: "probe_failed",
        })
        .where(inArray(cameras.id, slice));
    }
  }

  return {
    probed: rows.length,
    dead: aborted ? 0 : toDeactivate.length,
    revived: toRevive.length,
    aborted,
    durationMs: Date.now() - start,
  };
}
