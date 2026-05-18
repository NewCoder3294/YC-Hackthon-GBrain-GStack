import type { LiveIncident } from "@/lib/live-incidents";
import { LiveFeedPanel } from "./live-feed-panel";
import { AwaitingBackendPanel } from "./awaiting-backend-panel";

export function CockpitSidebar({
  liveIncidents,
}: {
  liveIncidents: LiveIncident[];
}) {
  return (
    <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-l border-neutral-200 bg-white lg:w-[360px]">
      <LiveFeedPanel rows={liveIncidents} />
      <AwaitingBackendPanel
        title="SF Brief"
        promise="One-paragraph AI synthesis of the last hour — patterns, neighborhood concentration, and prior dispatch outcomes — sourced from GBrain pages plus live signals."
        scheduledFor="Cockpit Phase 2"
      />
      <AwaitingBackendPanel
        title="Neighborhood Instability"
        promise="Rolling threat score per SF neighborhood polygon, weighted by signal density × severity × recency. Click a row to focus the map."
        scheduledFor="Cockpit Phase 3"
      />
      <AwaitingBackendPanel
        title="Shift Posture"
        promise="Active dispatch units, current backlog depth, and per-unit load. Pending real dispatch-unit data; not wired to a feed yet."
        scheduledFor="Cockpit Phase 5"
      />
    </aside>
  );
}
