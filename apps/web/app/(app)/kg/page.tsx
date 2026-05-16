import { KgGraph } from "@/components/kg/kg-graph";
import { RealtimeRefresh } from "@/components/kg/realtime-refresh";
import { loadKgFromSupabase } from "./data";

// All KG data is now live-backed. Patterns and baselines come from
// gbrain_records (TRD §3.3); decisions come from the decisions table;
// alerts come from predictive_alerts. The KG is fully wired to GBrain
// via the same-Postgres pattern documented in TRD §2.
export const dynamic = "force-dynamic";

export default async function KgPage() {
  const live = await loadKgFromSupabase();
  return (
    <div className="relative h-full">
      <KgGraph nodes={live.nodes} edges={live.edges} />
      <RealtimeRefresh />
    </div>
  );
}
