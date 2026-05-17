import { describe, it, expect } from "vitest";
import { buildOverview, OVERVIEW_EDGE_MIN, buildDetail, DETAIL_INCIDENT_LIMIT } from "./aggregate";
import type { KgNode, KgEdge } from "@/components/kg/types";

const n = (id: string, kind: KgNode["kind"], neighborhood: string, meta: KgNode["meta"] = {}): KgNode =>
  ({ id, kind, label: id, neighborhood, meta });

describe("buildOverview", () => {
  const nodes: KgNode[] = [
    n("inc:1", "incident", "Mission", { severity: 3 }),
    n("inc:2", "incident", "Mission", { severity: 5 }),
    n("inc:3", "incident", "Bayview Hunters Point", { severity: 2 }),
    n("alert:1", "alert", "Mission", {}),
    n("alert:2", "alert", "Mission", { ack: "acknowledged" }),
    n("gang:1", "gang", "Mission"),
    n("gang:1b", "gang", "Bayview Hunters Point"),
  ];
  const edges: KgEdge[] = [
    { id: "e1", source: "gang:1", target: "inc:3" }, // Mission <-> Bayview
    { id: "e2", source: "gang:1", target: "inc:1" }, // intra-Mission
  ];

  it("creates one cluster per distinct neighborhood", () => {
    const { clusters } = buildOverview(nodes, edges);
    expect(clusters.map((c) => c.neighborhood).sort()).toEqual([
      "Bayview Hunters Point",
      "Mission",
    ]);
  });
  it("counts incidents and unacked alerts and max severity per cluster", () => {
    const { clusters } = buildOverview(nodes, edges);
    const mission = clusters.find((c) => c.neighborhood === "Mission")!;
    expect(mission.incidentCount).toBe(2);
    expect(mission.alertCount).toBe(1); // alert:2 is acknowledged
    expect(mission.maxSeverity).toBe(5);
  });
  it("creates exactly one cross-neighborhood edge with the right endpoints and weight", () => {
    const { clusterEdges } = buildOverview(nodes, edges);
    expect(OVERVIEW_EDGE_MIN).toBe(1);
    expect(clusterEdges).toHaveLength(1);
    const ce = clusterEdges[0]!;
    expect(ce.weight).toBe(1);
    expect([ce.from, ce.to].sort()).toEqual(["Bayview Hunters Point", "Mission"]);
  });
});

describe("buildDetail", () => {
  const nodes: KgNode[] = [
    n("gang:1", "gang", "Mission"),
    n("alert:1", "alert", "Mission", {}),
    n("dec:1", "decision", "Mission"),
    ...Array.from({ length: 12 }, (_, i) =>
      n(`inc:${i}`, "incident", "Mission", { created_at: `2026-05-${10 + i}` }),
    ),
    ...Array.from({ length: 5 }, (_, i) => n(`member:${i}`, "member", "Mission")),
    n("inc:other", "incident", "Bayview Hunters Point"),
  ];
  const edges: KgEdge[] = [{ id: "e1", source: "gang:1", target: "alert:1" }];

  it("keeps gangs, alerts, decisions, and only the newest N incidents in the spine", () => {
    const { spine } = buildDetail("Mission", nodes, edges);
    const ids = spine.map((s) => s.id);
    expect(ids).toContain("gang:1");
    expect(ids).toContain("alert:1");
    expect(ids).toContain("dec:1");
    const inc = ids.filter((i) => i.startsWith("inc:"));
    expect(inc).toHaveLength(DETAIL_INCIDENT_LIMIT);
  });
  it("collapses the overflow into per-kind stubs", () => {
    const { stubs } = buildDetail("Mission", nodes, edges);
    const memberStub = stubs.find((s) => s.kind === "member");
    const incStub = stubs.find((s) => s.kind === "incident");
    expect(memberStub?.count).toBe(5);
    expect(incStub?.count).toBe(12 - DETAIL_INCIDENT_LIMIT);
  });
  it("excludes nodes from other neighborhoods", () => {
    const { spine, stubs } = buildDetail("Mission", nodes, edges);
    expect(spine.find((s) => s.id === "inc:other")).toBeUndefined();
    expect(stubs.every((s) => s.neighborhood === "Mission")).toBe(true);
  });
  it("returns empty spine/stubs/edges for an unknown neighborhood", () => {
    const r = buildDetail("Nowhere", nodes, edges);
    expect(r.spine).toEqual([]);
    expect(r.stubs).toEqual([]);
    expect(r.edges).toEqual([]);
  });
  it("collapses acknowledged alerts into the alert stub", () => {
    const withAcked: KgNode[] = [
      ...nodes,
      n("alert:acked", "alert", "Mission", { ack: "acknowledged" }),
    ];
    const { spine, stubs } = buildDetail("Mission", withAcked, edges);
    expect(spine.find((s) => s.id === "alert:acked")).toBeUndefined();
    expect(stubs.find((s) => s.kind === "alert")?.count).toBe(1);
  });
  it("expands a kind into the spine and drops its stub when requested", () => {
    const { spine, stubs } = buildDetail("Mission", nodes, edges, new Set(["member"]));
    expect(spine.filter((s) => s.kind === "member")).toHaveLength(5);
    expect(stubs.find((s) => s.kind === "member")).toBeUndefined();
  });
  it("expanding incident includes all incidents and removes the incident stub", () => {
    const { spine, stubs } = buildDetail("Mission", nodes, edges, new Set(["incident"]));
    expect(spine.filter((s) => s.kind === "incident")).toHaveLength(12);
    expect(stubs.find((s) => s.kind === "incident")).toBeUndefined();
  });
  it("non-expanded kinds still collapse to stubs", () => {
    const { stubs } = buildDetail("Mission", nodes, edges, new Set(["member"]));
    expect(stubs.find((s) => s.kind === "incident")?.count).toBe(12 - DETAIL_INCIDENT_LIMIT);
  });
});
