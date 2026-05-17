import { describe, it, expect, vi } from "vitest";
import type { Db } from "@caltrans/db";
import { writeIncidentPages } from "./gbrain-writer";
import type { IncidentPage } from "./pages";

function page(slug: string): IncidentPage {
  return {
    slug,
    type: "incident",
    title: "P1 · weapons-violence",
    compiledTruth: "body",
    timeline: "11:30 camera — armed person",
    frontmatter: {
      kind: "incident",
      meta: {},
      source: "correlator",
      samples: 2,
      legacy_id: slug,
      confidence: 0.8,
      created_at: "2026-05-16T12:00:00.000Z",
      related_gang_id: null,
      related_incident_id: null,
    },
    tags: ["incident", "priority:P1"],
  };
}

/**
 * Fake Db. Each page cycle is: INSERT (returns [{id}]) → DELETE tags →
 * one INSERT per tag. `throwOnCall` (1-based) simulates an insert error.
 */
function fakeDb(opts: { throwOnCall?: number } = {}): {
  db: Db;
  count: () => number;
} {
  let n = 0;
  const execute = vi.fn(async () => {
    n += 1;
    if (opts.throwOnCall === n) throw new Error("insert failed");
    return [{ id: 1 }];
  });
  return { db: { execute } as unknown as Db, count: () => n };
}

describe("writeIncidentPages", () => {
  it("upserts the page then replaces its tags (insert+delete+2 tags)", async () => {
    const { db, count } = fakeDb();
    const res = await writeIncidentPages(db, [page("incident-1")]);
    expect(res).toEqual({ written: 1, failures: [] });
    expect(count()).toBe(4); // 1 insert + 1 delete + 2 tag inserts
  });

  it("counts a failed page without aborting the rest", async () => {
    const { db } = fakeDb({ throwOnCall: 1 }); // first page's insert
    const res = await writeIncidentPages(db, [
      page("incident-bad"),
      page("incident-ok"),
    ]);
    expect(res.written).toBe(1);
    expect(res.failures).toEqual([
      { slug: "incident-bad", message: "insert failed" },
    ]);
  });
});
