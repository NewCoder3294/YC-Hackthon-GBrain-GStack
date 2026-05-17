import type {
  KgNode,
  KgEdge,
  NeighborhoodCluster,
  ClusterEdge,
} from "@/components/kg/types";

/** Minimum cross-neighborhood link count to draw an overview arc. */
export const OVERVIEW_EDGE_MIN = 1;

/** Aggregates raw KG nodes/edges into neighborhood clusters and cross-neighborhood arcs. */
export function buildOverview(
  nodes: KgNode[],
  edges: KgEdge[],
): { clusters: NeighborhoodCluster[]; clusterEdges: ClusterEdge[] } {
  const byNbhd = new Map<string, NeighborhoodCluster>();
  const nbOf = new Map<string, string>();

  for (const node of nodes) {
    const nb = node.neighborhood ?? "Unmapped";
    nbOf.set(node.id, nb);
    let c = byNbhd.get(nb);
    if (!c) {
      c = {
        neighborhood: nb,
        nodeIds: [],
        incidentCount: 0,
        alertCount: 0,
        maxSeverity: 0,
      };
      byNbhd.set(nb, c);
    }
    c.nodeIds.push(node.id);
    if (node.kind === "incident") {
      c.incidentCount++;
      const sev = Number(node.meta?.severity ?? 0);
      if (sev > c.maxSeverity) c.maxSeverity = sev;
    }
    if (node.kind === "alert" && node.meta?.ack !== "acknowledged") {
      c.alertCount++;
    }
  }

  const pairCount = new Map<string, number>();
  for (const e of edges) {
    const a = nbOf.get(e.source);
    const b = nbOf.get(e.target);
    if (!a || !b || a === b) continue;
    const key = [a, b].sort().join("|");
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
  }

  const clusterEdges: ClusterEdge[] = [];
  for (const [key, weight] of pairCount) {
    if (weight < OVERVIEW_EDGE_MIN) continue;
    const [from, to] = key.split("|") as [string, string];
    clusterEdges.push({ id: `ce:${from}->${to}`, from, to, weight });
  }

  const clusters = [...byNbhd.values()].sort(
    (x, y) => y.incidentCount - x.incidentCount,
  );
  return { clusters, clusterEdges };
}
