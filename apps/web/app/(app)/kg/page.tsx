import { KgGraph } from "@/components/kg/kg-graph";
import type { KgEdge, KgNode } from "@/components/kg/types";
import { loadLiveKgNodes } from "./data";

// Synthetic GBrain priors — patterns and baselines that GBrain would have
// learned across the demo neighborhoods. Live incidents from the DB get
// merged in at request time so the graph shows real activity feeding into
// the same memory layer.
const fixtureNodes: KgNode[] = [
  // Locations (SF dispatch corners — matches DEMO_SCRIPT)
  { id: "loc:mission-16th", kind: "location", label: "Mission & 16th", sub: "SF · Mission" },
  { id: "loc:tenderloin-jones-eddy", kind: "location", label: "Jones & Eddy", sub: "Tenderloin" },
  { id: "loc:soma-7th-howard", kind: "location", label: "7th & Howard", sub: "SoMa" },
  { id: "loc:fidi-market", kind: "location", label: "Market & 2nd", sub: "FiDi" },

  // Historical reviewed incidents (priors GBrain has on file)
  {
    id: "inc:2026-05-09-mission",
    kind: "incident",
    label: "Possible assault",
    sub: "2026-05-09 · 23:17",
    meta: { signals: "3", severity: "0.71", clip: "30s" },
    source: "fixture",
  },
  {
    id: "inc:2026-05-12-tenderloin",
    kind: "incident",
    label: "Disturbance",
    sub: "2026-05-12 · 02:04",
    meta: { signals: "2", severity: "0.42" },
    source: "fixture",
  },
  {
    id: "inc:2026-05-14-soma",
    kind: "incident",
    label: "Vehicle collision",
    sub: "2026-05-14 · 17:48",
    meta: { signals: "4", severity: "0.83" },
    source: "fixture",
  },
  {
    id: "inc:2026-05-15-fidi",
    kind: "incident",
    label: "Suspicious package",
    sub: "2026-05-15 · 08:31",
    meta: { signals: "2", severity: "0.38" },
    source: "fixture",
  },

  // Dispatcher decisions — feedback that trains GBrain
  {
    id: "dec:dismiss-mission",
    kind: "decision",
    label: "Dismissed",
    sub: "false-positive · firework",
    meta: { reviewer: "SFPD-4471", at: "23:21" },
    source: "fixture",
  },
  {
    id: "dec:act-soma",
    kind: "decision",
    label: "Acted",
    sub: "ambulance dispatched",
    meta: { reviewer: "SFPD-4471", at: "17:50" },
    source: "fixture",
  },
  {
    id: "dec:hold-tenderloin",
    kind: "decision",
    label: "Held",
    sub: "pending corroboration",
    meta: { reviewer: "SFPD-2280", at: "02:06" },
    source: "fixture",
  },
  {
    id: "dec:dismiss-fidi",
    kind: "decision",
    label: "Dismissed",
    sub: "abandoned bag · cleared",
    meta: { reviewer: "SFPD-2280", at: "08:38" },
    source: "fixture",
  },

  // Patterns — derived by GBrain from decisions over time
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
    id: "pat:package-business-hours",
    kind: "pattern",
    label: "Stationary package · business hours",
    sub: "dismiss-rate 0.78",
    meta: { samples: "23", confidence: "0.78" },
    source: "fixture",
  },

  // Baselines — rolling 90-day stats per location
  {
    id: "base:mission-16th-90d",
    kind: "baseline",
    label: "0.4 violent calls / wk",
    sub: "90d rolling · Mission & 16th",
    meta: { thisWeek: "3", anomaly: "yes" },
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
  {
    id: "base:tenderloin-90d",
    kind: "baseline",
    label: "5.8 disturbances / wk",
    sub: "90d rolling · Tenderloin",
    meta: { thisWeek: "6", anomaly: "no" },
    source: "fixture",
  },
];

const fixtureEdges: KgEdge[] = [
  // location → incident
  { id: "e1", source: "loc:mission-16th", target: "inc:2026-05-09-mission" },
  { id: "e2", source: "loc:tenderloin-jones-eddy", target: "inc:2026-05-12-tenderloin" },
  { id: "e3", source: "loc:soma-7th-howard", target: "inc:2026-05-14-soma" },
  { id: "e3b", source: "loc:fidi-market", target: "inc:2026-05-15-fidi" },

  // incident → decision
  { id: "e4", source: "inc:2026-05-09-mission", target: "dec:dismiss-mission", label: "decided" },
  { id: "e5", source: "inc:2026-05-12-tenderloin", target: "dec:hold-tenderloin", label: "decided" },
  { id: "e6", source: "inc:2026-05-14-soma", target: "dec:act-soma", label: "decided" },
  { id: "e6b", source: "inc:2026-05-15-fidi", target: "dec:dismiss-fidi", label: "decided" },

  // decision → pattern (learning loop)
  { id: "e7", source: "dec:dismiss-mission", target: "pat:cam-911-30s", label: "reinforces" },
  { id: "e8", source: "dec:hold-tenderloin", target: "pat:running-no-call", label: "matches" },
  { id: "e8b", source: "dec:dismiss-fidi", target: "pat:package-business-hours", label: "reinforces" },

  // location → baseline
  { id: "e9", source: "loc:mission-16th", target: "base:mission-16th-90d" },
  { id: "e10", source: "loc:soma-7th-howard", target: "base:soma-90d" },
  { id: "e10b", source: "loc:tenderloin-jones-eddy", target: "base:tenderloin-90d" },

  // baseline → pattern (informs)
  { id: "e11", source: "base:mission-16th-90d", target: "pat:cam-911-30s", label: "informs" },
  { id: "e11b", source: "base:tenderloin-90d", target: "pat:running-no-call", label: "informs" },
];

export const dynamic = "force-dynamic";

export default async function KgPage() {
  const live = await loadLiveKgNodes();
  const nodes = [...fixtureNodes, ...live.nodes];
  const edges = [...fixtureEdges, ...live.edges];
  return <KgGraph nodes={nodes} edges={edges} />;
}
