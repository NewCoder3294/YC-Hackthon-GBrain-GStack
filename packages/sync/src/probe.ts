import { cameras, type Db } from "@caltrans/db";
import { eq, inArray } from "drizzle-orm";

export interface ProbeDeps {
  db: Db;
  fetch: typeof globalThis.fetch;
  concurrency?: number;
  timeoutMs?: number;
}

export interface ProbeResult {
  probed: number;
  dead: number;
  durationMs: number;
}

const DEFAULTS = { concurrency: 20, timeoutMs: 6000 } as const;

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
  const start = Date.now();

  const rows = await deps.db
    .select({ id: cameras.id, url: cameras.streamUrl })
    .from(cameras)
    .where(eq(cameras.isActive, true));

  if (rows.length === 0) {
    return { probed: 0, dead: 0, durationMs: Date.now() - start };
  }

  const deadIds: string[] = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= rows.length) return;
      const row = rows[i]!;
      const alive = await probeOne(row.url, deps.fetch, timeoutMs);
      if (!alive) deadIds.push(row.id);
    }
  }
  const workerCount = Math.min(concurrency, rows.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (deadIds.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < deadIds.length; i += CHUNK) {
      const slice = deadIds.slice(i, i + CHUNK);
      await deps.db
        .update(cameras)
        .set({ isActive: false })
        .where(inArray(cameras.id, slice));
    }
  }

  return { probed: rows.length, dead: deadIds.length, durationMs: Date.now() - start };
}
