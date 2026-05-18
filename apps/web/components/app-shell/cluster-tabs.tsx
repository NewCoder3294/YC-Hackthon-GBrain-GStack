import type { Route } from "next";
import { SubTabs } from "./sub-tabs";

const INCIDENT_TABS: { href: Route; label: string }[] = [
  { href: "/triage" as Route, label: "Triage" },
  { href: "/incidents" as Route, label: "Ranked" },
  { href: "/live" as Route, label: "Live (CAD/511)" },
  { href: "/feed" as Route, label: "Raw feed" },
];

const INTEL_TABS: { href: Route; label: string }[] = [
  { href: "/kg" as Route, label: "Knowledge graph" },
  { href: "/enrichment" as Route, label: "Web search" },
];

export function IncidentClusterTabs() {
  return <SubTabs label="Incidents" tabs={INCIDENT_TABS} />;
}

export function IntelClusterTabs() {
  return <SubTabs label="Intel" tabs={INTEL_TABS} />;
}
