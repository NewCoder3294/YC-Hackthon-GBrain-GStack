import type { LiveIncident } from "@/lib/live-incidents";
import type {
  CityRiskSnapshot,
  CockpitAggregates,
  NeighborhoodInstability,
} from "@/lib/cockpit/instability";
import type { SFBrief } from "@/lib/cockpit/sf-brief";
import type { TrafficDisruption } from "@/lib/cockpit/traffic-disruptions";
import { LiveFeedPanel } from "./live-feed-panel";
import { NeighborhoodInstabilityPanel } from "./neighborhood-instability-panel";
import { RiskOverviewPanel } from "./risk-overview-panel";
import { SeverityMixPanel } from "./severity-mix-panel";
import { CrimeTypesPanel } from "./crime-types-panel";
import { SourceMixPanel } from "./source-mix-panel";
import { HourlyPulsePanel } from "./hourly-pulse-panel";
import { SFBriefPanel } from "./sf-brief-panel";
import { TrafficDisruptionsPanel } from "./traffic-disruptions-panel";
import {
  CockpitWidgetHost,
  type CockpitWidget,
} from "./cockpit-widget-host";

interface Props {
  liveIncidents: LiveIncident[];
  instabilityRanking: NeighborhoodInstability[];
  cityRisk: CityRiskSnapshot;
  aggregates: CockpitAggregates;
  sfBrief: SFBrief;
  trafficDisruptions: TrafficDisruption[];
}

export function CockpitSidebar({
  liveIncidents,
  instabilityRanking,
  cityRisk,
  aggregates,
  sfBrief,
  trafficDisruptions,
}: Props) {
  // Server-rendered widget bodies passed as children into the client host.
  // The host owns ordering + visibility, the panels stay pure presentational.
  const widgets: CockpitWidget[] = [
    {
      id: "risk-overview",
      label: "Risk Overview",
      defaultSpan: 2,
      node: <RiskOverviewPanel snapshot={cityRisk} />,
    },
    {
      id: "severity-mix",
      label: "Severity Mix",
      defaultSpan: 1,
      node: <SeverityMixPanel severity={aggregates.severity} />,
    },
    {
      id: "crime-types",
      label: "Crime Types",
      defaultSpan: 1,
      node: <CrimeTypesPanel rows={aggregates.topCrimeTypes} />,
    },
    {
      id: "hourly-pulse",
      label: "Hourly Pulse",
      defaultSpan: 2,
      node: <HourlyPulsePanel buckets={aggregates.hourlyPulse} />,
    },
    {
      id: "live-feed",
      label: "Live Feed",
      defaultSpan: 2,
      node: <LiveFeedPanel rows={liveIncidents} />,
    },
    {
      id: "neighborhood-instability",
      label: "Neighborhood Instability",
      defaultSpan: 2,
      node: <NeighborhoodInstabilityPanel rows={instabilityRanking} />,
    },
    {
      id: "source-mix",
      label: "Source Mix",
      defaultSpan: 2,
      node: <SourceMixPanel rows={aggregates.sourceMix} />,
    },
    {
      id: "sf-brief",
      label: "SF Brief",
      defaultSpan: 2,
      node: <SFBriefPanel brief={sfBrief} />,
    },
    {
      id: "traffic-disruptions",
      label: "Traffic Disruptions",
      defaultSpan: 2,
      node: <TrafficDisruptionsPanel rows={trafficDisruptions} />,
    },
  ];

  return <CockpitWidgetHost widgets={widgets} />;
}
