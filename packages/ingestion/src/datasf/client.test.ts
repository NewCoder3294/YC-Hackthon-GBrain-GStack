import { describe, it, expect, vi } from "vitest";
import {
  buildQuery,
  fetchIncidents,
  socrataSince,
  RateLimitedError,
  type FetchDeps,
} from "./client";

function res(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  const headers = init.headers ?? {};
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 429 ? "Too Many Requests" : "OK",
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

const noSleep = (): Promise<void> => Promise.resolve();

describe("buildQuery", () => {
  it("emits ordered, windowed, paged SODA params", () => {
    const qs = new URLSearchParams(
      buildQuery({ sinceIso: "2025-05-01T00:00:00", limit: 1000, offset: 2000 }),
    );
    expect(qs.get("$order")).toBe("incident_datetime");
    expect(qs.get("$limit")).toBe("1000");
    expect(qs.get("$offset")).toBe("2000");
    expect(qs.get("$where")).toBe(
      "incident_datetime > '2025-05-01T00:00:00'",
    );
  });
});

describe("socrataSince", () => {
  it("produces a floating timestamp with no trailing Z", () => {
    expect(socrataSince(new Date("2025-05-01T12:34:56.789Z"))).toBe(
      "2025-05-01T12:34:56",
    );
  });
});

describe("fetchIncidents", () => {
  it("paginates by offset until a short page, respecting maxRows", async () => {
    const pages = [
      [{ row_id: "1" }, { row_id: "2" }],
      [{ row_id: "3" }, { row_id: "4" }],
      [{ row_id: "5" }], // short → last
    ];
    let call = 0;
    const urls: string[] = [];
    const fetchMock = async (url: string | URL): Promise<Response> => {
      urls.push(String(url));
      return res(pages[call++] ?? []);
    };
    const deps: FetchDeps = {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: noSleep,
    };

    const rows = await fetchIncidents(deps, {
      sinceIso: "2025-05-01T00:00:00",
      pageLimit: 2,
      maxRows: 100,
      throttleMs: 0,
    });

    expect(rows).toHaveLength(5);
    expect(urls).toHaveLength(3);
    // offsets advance: 0, 2, 4
    expect(urls[0]).toContain("%24offset=0");
    expect(urls[1]).toContain("%24offset=2");
    expect(urls[2]).toContain("%24offset=4");
  });

  it("caps at maxRows and shrinks the final page limit", async () => {
    const fetchMock = vi.fn(async () =>
      res([{ row_id: "a" }, { row_id: "b" }, { row_id: "c" }]),
    );
    const deps: FetchDeps = { fetch: fetchMock as unknown as typeof fetch, sleep: noSleep };
    const rows = await fetchIncidents(deps, {
      sinceIso: "2025-05-01T00:00:00",
      pageLimit: 3,
      maxRows: 3,
      throttleMs: 0,
    });
    expect(rows).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 then succeeds", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) return res([], { status: 429, headers: { "retry-after": "0" } });
      return res([{ row_id: "1" }]);
    });
    const deps: FetchDeps = { fetch: fetchMock as unknown as typeof fetch, sleep: noSleep };
    const rows = await fetchIncidents(deps, {
      sinceIso: "2025-05-01T00:00:00",
      pageLimit: 10,
      maxRows: 10,
      throttleMs: 0,
    });
    expect(rows).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws RateLimitedError after exhausting retries", async () => {
    const fetchMock = vi.fn(async () =>
      res([], { status: 429, headers: { "retry-after": "0" } }),
    );
    const deps: FetchDeps = { fetch: fetchMock as unknown as typeof fetch, sleep: noSleep };
    await expect(
      fetchIncidents(deps, {
        sinceIso: "2025-05-01T00:00:00",
        pageLimit: 10,
        maxRows: 10,
        throttleMs: 0,
        maxRetries: 2,
      }),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("sends X-App-Token when provided", async () => {
    let seenHeaders: Record<string, string> = {};
    const fetchMock = async (
      _url: string | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      seenHeaders = (init?.headers as Record<string, string>) ?? {};
      return res([]);
    };
    const deps: FetchDeps = {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: noSleep,
      appToken: "tok-123",
    };
    await fetchIncidents(deps, {
      sinceIso: "2025-05-01T00:00:00",
      pageLimit: 10,
      maxRows: 10,
      throttleMs: 0,
    });
    expect(seenHeaders["X-App-Token"]).toBe("tok-123");
  });

  it("throws on non-2xx non-429", async () => {
    const fetchMock = vi.fn(async () => res(null, { status: 500 }));
    const deps: FetchDeps = { fetch: fetchMock as unknown as typeof fetch, sleep: noSleep };
    await expect(
      fetchIncidents(deps, {
        sinceIso: "2025-05-01T00:00:00",
        pageLimit: 10,
        maxRows: 10,
        throttleMs: 0,
      }),
    ).rejects.toThrow(/Socrata fetch failed: 500/);
  });
});
