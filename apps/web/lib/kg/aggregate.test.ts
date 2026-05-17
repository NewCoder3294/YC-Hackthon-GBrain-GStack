import { describe, it, expect } from "vitest";
import { buildOverview, OVERVIEW_EDGE_MIN } from "./aggregate";
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
