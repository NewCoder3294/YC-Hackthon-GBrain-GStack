import { cameras, type Db } from "@caltrans/db";
import { inArray } from "drizzle-orm";

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
  // Caltrans D4's CDN routinely 404s 60–80% of the URLs it advertises in
  // cctvStatusD04.json (the syncCameras comment notes the same). At the
  // old 0.5 threshold every probe run aborted, dead URLs accumulated, and
  // /wall went empty. 0.95 still catches a near-total worker egress outage
  // (where 100% fail) but lets the probe deactivate the actual rot.
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

  // Probe every camera, including currently-inactive ones, so streams that
  // come back online get revived. The cost of probing dead URLs is bounded
  // by `timeoutMs`.
  const rows = await deps.db
    .select({
      id: cameras.id,
      url: cameras.streamUrl,
      isActive: cameras.isActive,
    })
    .from(cameras);

  if (rows.length === 0) {
    return { probed: 0, dead: 0, revived: 0, aborted: false, durationMs: Date.now() - start };
  }

  type Probed = { id: string; wasActive: boolean; alive: boolean };
  const results: Probed[] = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= rows.length) return;
      const row = rows[i]!;
      const alive = await probeOne(row.url, deps.fetch, timeoutMs);
      results.push({ id: row.id, wasActive: row.isActive, alive });
    }
  }
  const workerCount = Math.min(concurrency, rows.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const toDeactivate = results.filter((r) => r.wasActive && !r.alive);
  const toRevive = results.filter((r) => !r.wasActive && r.alive);
  const activeCount = results.filter((r) => r.wasActive).length;

  // Transient-outage safety net: if more than `abortThreshold` of previously-
  // active cameras suddenly fail in a single run, assume the worker's
  // egress is flaky and skip writes. Revivals are still safe to apply
  // because a successful HTTP response cannot be confused with an outage.
  const aborted =
    activeCount > 0 && toDeactivate.length / activeCount > abortThreshold;

  if (!aborted && toDeactivate.length > 0) {
    const CHUNK = 200;
    const ids = toDeactivate.map((r) => r.id);
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      await deps.db
        .update(cameras)
        .set({ isActive: false })
        .where(inArray(cameras.id, slice));
    }
  }

  if (toRevive.length > 0) {
    const CHUNK = 200;
    const ids = toRevive.map((r) => r.id);
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      await deps.db
        .update(cameras)
        .set({ isActive: true })
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
