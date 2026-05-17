import type {
  KgNode,
  KgEdge,
  NeighborhoodCluster,
  ClusterEdge,
  StubNode,
  KgNodeKind,
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

export const DETAIL_INCIDENT_LIMIT = 8;
const SPINE_KINDS: ReadonlySet<KgNodeKind> = new Set([
  "gang",
  "decision",
]);

export function buildDetail(
  neighborhood: string,
  nodes: KgNode[],
  edges: KgEdge[],
): { spine: KgNode[]; stubs: StubNode[]; edges: KgEdge[] } {
  const local = nodes.filter((x) => (x.neighborhood ?? "Unmapped") === neighborhood);

  const spine: KgNode[] = [];
  const overflow = new Map<KgNodeKind, number>();

  const incidents = local
    .filter((x) => x.kind === "incident")
    .sort((a, b) =>
      String(b.meta?.created_at ?? "").localeCompare(String(a.meta?.created_at ?? "")),
    );
  incidents.slice(0, DETAIL_INCIDENT_LIMIT).forEach((i) => spine.push(i));
  if (incidents.length > DETAIL_INCIDENT_LIMIT) {
    overflow.set("incident", incidents.length - DETAIL_INCIDENT_LIMIT);
  }

  for (const x of local) {
    if (x.kind === "incident") continue;
    const isSpine =
      SPINE_KINDS.has(x.kind) ||
      (x.kind === "alert" && x.meta?.ack !== "acknowledged");
    if (isSpine) spine.push(x);
    else overflow.set(x.kind, (overflow.get(x.kind) ?? 0) + 1);
  }

  const stubs: StubNode[] = [...overflow.entries()].map(([kind, count]) => ({
    id: `stub:${neighborhood}:${kind}`,
    neighborhood,
    kind,
    count,
  }));

  const spineIds = new Set(spine.map((s) => s.id));
  const detailEdges = edges.filter(
    (e) => spineIds.has(e.source) && spineIds.has(e.target),
  );

  return { spine, stubs, edges: detailEdges };
}
