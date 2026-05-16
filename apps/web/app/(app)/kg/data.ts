import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { KgEdge, KgNode } from "@/components/kg/types";
import { fetchRecentDispatch } from "@/lib/dispatch-fetch";
import { isHighPriority, priorityLabel } from "@/lib/dispatch";

interface GangRow {
  id: string;
  name: string;
  aliases: string[];
  color: string | null;
  active: boolean;
  notes: string | null;
}

interface MemberRow {
  id: string;
  gang_id: string | null;
  full_name: string;
  aliases: string[];
  role: string;
  status: string;
  last_seen_at: string | null;
  last_seen_location: string | null;
}

interface TerritoryRow {
  id: string;
  gang_id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_m: number;
}

interface ArrestRow {
  id: string;
  member_id: string | null;
  arrested_at: string;
  location: string | null;
  charges: string[];
  outcome: string | null;
  agency: string | null;
}

interface AlertRow {
  id: string;
  incident_id: string | null;
  alert_type: string;
  triggering_gang_id: string | null;
  affected_gang_id: string | null;
  territory_id: string | null;
  confidence: number | string | null;
  reasoning: string | null;
  acknowledged_at: string | null;
}

interface IncidentRow {
  id: string;
  title: string;
  severity: "low" | "med" | "high";
  created_at: string;
  suspect_gang_id: string | null;
  clips: {
    cameras: {
      route: string;
      direction: string | null;
      description: string;
    } | null;
  }[];
}

function locationIdForCamera(route: string, direction: string | null): string {
  const dir = direction ? `-${direction.toLowerCase()}` : "";
  return `loc:${route.toLowerCase()}${dir}`;
}

function locationLabel(route: string, direction: string | null): string {
  return direction ? `${route} ${direction}` : route;
}

function neighborhoodId(name: string): string {
  return `loc:nb:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function isoToHuman(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 16).replace("T", " ");
}

export async function loadKgFromSupabase(): Promise<{
  nodes: KgNode[];
  edges: KgEdge[];
}> {
  const supabase = await createClient();

  const [
    gangsRes,
    membersRes,
    territoriesRes,
    arrestsRes,
    alertsRes,
    incidentsRes,
    dispatchCalls,
  ] = await Promise.all([
    supabase.from("gangs").select("id, name, aliases, color, active, notes"),
    supabase
      .from("gang_members")
      .select(
        "id, gang_id, full_name, aliases, role, status, last_seen_at, last_seen_location",
      )
      .order("role"),
    supabase
      .from("gang_territories")
      .select("id, gang_id, name, center_lat, center_lng, radius_m"),
    supabase
      .from("arrests")
      .select("id, member_id, arrested_at, location, charges, outcome, agency")
      .order("arrested_at", { ascending: false }),
    supabase
      .from("predictive_alerts")
      .select(
        "id, incident_id, alert_type, triggering_gang_id, affected_gang_id, territory_id, confidence, reasoning, acknowledged_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("incidents")
      .select(
        "id, title, severity, created_at, suspect_gang_id, clips (cameras (route, direction, description))",
      )
      .order("created_at", { ascending: false })
      .limit(40),
    // Live SF Open Data dispatch (audio readout source). Limited so the
    // graph stays legible — KG shows the freshest activity at a glance.
    fetchRecentDispatch({ limit: 30, revalidate: 60 }),
  ]);

  const gangs = (gangsRes.data ?? []) as GangRow[];
  const members = (membersRes.data ?? []) as MemberRow[];
  const territories = (territoriesRes.data ?? []) as TerritoryRow[];
  const arrests = (arrestsRes.data ?? []) as ArrestRow[];
  const alerts = (alertsRes.data ?? []) as AlertRow[];
  const incidents = (incidentsRes.data ?? []) as unknown as IncidentRow[];

  const nodes: KgNode[] = [];
  const edges: KgEdge[] = [];
  const seenLocations = new Set<string>();

  for (const g of gangs) {
    const aliasLine = g.aliases?.length ? `aka ${g.aliases.join(", ")}` : "";
    const colorLine = g.color ? `color: ${g.color}` : "";
    nodes.push({
      id: `gang:${g.id}`,
      kind: "gang",
      label: g.name,
      sub: aliasLine || colorLine,
      meta: {
        status: g.active ? "active" : "inactive",
        color: g.color ?? "—",
      },
      source: "live",
    });
  }

  for (const m of members) {
    const meta: Record<string, string | number> = {
      role: m.role,
      status: m.status,
    };
    if (m.last_seen_at) meta.lastSeen = isoToHuman(m.last_seen_at);
    nodes.push({
      id: `member:${m.id}`,
      kind: "member",
      label: m.full_name,
      sub: `${m.role} · ${m.status}${m.last_seen_location ? ` · last @ ${m.last_seen_location}` : ""}`,
      meta,
      source: "live",
    });
    if (m.gang_id) {
      edges.push({
        id: `e:gang-member:${m.id}`,
        source: `gang:${m.gang_id}`,
        target: `member:${m.id}`,
        label: m.role,
      });
    }
  }

  for (const a of arrests) {
    if (!a.member_id) continue;
    nodes.push({
      id: `arrest:${a.id}`,
      kind: "arrest",
      label: a.charges.join(", ") || "Arrest",
      sub: `${isoToHuman(a.arrested_at)}${a.location ? ` · ${a.location}` : ""}`,
      meta: {
        outcome: a.outcome ?? "—",
        agency: a.agency ?? "—",
      },
      source: "live",
    });
    edges.push({
      id: `e:member-arrest:${a.id}`,
      source: `member:${a.member_id}`,
      target: `arrest:${a.id}`,
      label: "arrest",
    });
  }

  for (const t of territories) {
    nodes.push({
      id: `territory:${t.id}`,
      kind: "territory",
      label: t.name,
      sub: `${t.radius_m}m radius · ${t.center_lat.toFixed(4)}, ${t.center_lng.toFixed(4)}`,
      meta: {
        gang: gangs.find((g) => g.id === t.gang_id)?.name ?? "—",
      },
      source: "live",
    });
    edges.push({
      id: `e:gang-territory:${t.id}`,
      source: `gang:${t.gang_id}`,
      target: `territory:${t.id}`,
      label: "controls",
    });
  }

  for (const i of incidents) {
    const cam = i.clips[0]?.cameras ?? null;
    nodes.push({
      id: `inc:${i.id}`,
      kind: "incident",
      label: i.title,
      sub: `${isoToHuman(i.created_at)}${cam ? ` · ${cam.route}${cam.direction ? ` ${cam.direction}` : ""}` : ""}`,
      meta: {
        severity: i.severity,
      },
      source: "live",
    });

    if (cam) {
      const locId = locationIdForCamera(cam.route, cam.direction);
      if (!seenLocations.has(locId)) {
        nodes.push({
          id: locId,
          kind: "location",
          label: locationLabel(cam.route, cam.direction),
          sub: cam.description,
          source: "live",
        });
        seenLocations.add(locId);
      }
      edges.push({
        id: `e:loc-inc:${i.id}`,
        source: locId,
        target: `inc:${i.id}`,
      });
    }

    if (i.suspect_gang_id) {
      edges.push({
        id: `e:gang-suspect-inc:${i.id}`,
        source: `gang:${i.suspect_gang_id}`,
        target: `inc:${i.id}`,
        label: "suspect",
      });
    }
  }

  // Dispatch (audio-readout) nodes from live SFGov data, with seeded
  // neighborhood location nodes so the graph has place-of-occurrence context.
  for (const call of dispatchCalls) {
    const placeName = call.neighborhood || call.district || "SF · unknown area";
    const locId = neighborhoodId(placeName);
    if (!seenLocations.has(locId)) {
      nodes.push({
        id: locId,
        kind: "location",
        label: placeName,
        sub: "neighborhood (SFGov)",
        source: "live",
      });
      seenLocations.add(locId);
    }
    nodes.push({
      id: `dispatch:${call.id}`,
      kind: "dispatch",
      label: `${call.callTypeCode ? `${call.callTypeCode} · ` : ""}${call.callType}`,
      sub: `${call.address} · ${isoToHuman(call.receivedAt)}`,
      meta: {
        priority: priorityLabel(call.priority),
        callNumber: call.callNumber,
        agency: call.agency,
        urgent: isHighPriority(call.priority) ? "yes" : "no",
      },
      source: "live",
    });
    edges.push({
      id: `e:loc-dispatch:${call.id}`,
      source: locId,
      target: `dispatch:${call.id}`,
      label: "call",
    });
  }

  for (const a of alerts) {
    nodes.push({
      id: `alert:${a.id}`,
      kind: "alert",
      label:
        a.alert_type === "rival_territory_intrusion"
          ? "Rival territory intrusion"
          : a.alert_type,
      sub: a.reasoning ?? "",
      meta: {
        confidence:
          a.confidence != null ? Number(a.confidence).toFixed(2) : "—",
        ack: a.acknowledged_at ? "acknowledged" : "pending",
      },
      source: "live",
    });
    if (a.incident_id) {
      edges.push({
        id: `e:inc-alert:${a.id}`,
        source: `inc:${a.incident_id}`,
        target: `alert:${a.id}`,
        label: "flagged",
      });
    }
    if (a.territory_id) {
      edges.push({
        id: `e:alert-territory:${a.id}`,
        source: `alert:${a.id}`,
        target: `territory:${a.territory_id}`,
        label: "intrudes",
      });
    }
    if (a.affected_gang_id) {
      edges.push({
        id: `e:alert-gang:${a.id}`,
        source: `alert:${a.id}`,
        target: `gang:${a.affected_gang_id}`,
        label: "affects",
      });
    }
  }

  return { nodes, edges };
}
