import { KgGraph } from "@/components/kg/kg-graph";
import type { KgEdge, KgNode } from "@/components/kg/types";
import { loadKgFromSupabase } from "./data";

// Patterns + baselines are still synthetic until a derivation job writes
// them into Supabase. Everything else (gangs, members, territories, arrests,
// incidents, alerts) is now live-backed.
const fixturePatternBaseline: { nodes: KgNode[]; edges: KgEdge[] } = {
  nodes: [
    {
      id: "pat:cam-911-30s",
      kind: "pattern",
      label: "Camera + 911 hangup ≤30s",
      sub: "false-positive 4 / 5",
      meta: { samples: "5", confidence: "0.82" },
      source: "fixture",
    },
    {
      id: "pat:running-no-call",
      kind: "pattern",
      label: "'Running' alone · no other signal",
      sub: "dismiss-rate 0.91",
      meta: { samples: "47", confidence: "0.91" },
      source: "fixture",
    },
    {
      id: "pat:cross-territory-night",
      kind: "pattern",
      label: "Cross-territory sighting at night",
      sub: "escalation-rate 0.62",
      meta: { samples: "21", confidence: "0.79" },
      source: "fixture",
    },
    {
      id: "base:mission-90d",
      kind: "baseline",
      label: "0.4 violent calls / wk",
      sub: "90d rolling · Mission corridor",
      meta: { thisWeek: "3", anomaly: "yes" },
      source: "fixture",
    },
    {
      id: "base:tenderloin-90d",
      kind: "baseline",
      label: "5.8 disturbances / wk",
      sub: "90d rolling · Tenderloin",
      meta: { thisWeek: "6", anomaly: "no" },
      source: "fixture",
    },
    {
      id: "base:soma-90d",
      kind: "baseline",
      label: "1.2 collisions / wk",
      sub: "90d rolling · SoMa core",
      meta: { thisWeek: "1", anomaly: "no" },
      source: "fixture",
    },
  ],
  edges: [],
};

export const dynamic = "force-dynamic";

export default async function KgPage() {
  const live = await loadKgFromSupabase();
  const nodes = [...live.nodes, ...fixturePatternBaseline.nodes];
  const edges = [...live.edges, ...fixturePatternBaseline.edges];
  return <KgGraph nodes={nodes} edges={edges} />;
}
