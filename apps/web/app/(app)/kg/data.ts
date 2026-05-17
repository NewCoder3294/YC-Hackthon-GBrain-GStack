import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { KgEdge, KgNode } from "@/components/kg/types";
import { isHighPriority, priorityLabel } from "@/lib/dispatch";
import { scanDispatchAudio } from "@/lib/dispatch-audio-scan";
import {
  createSimulatorState,
  nextDispatchCall,
} from "@/lib/dispatch-simulator";
import {
  resolveNeighborhood,
  nearestHotspot,
  matchHotspotByName,
  UNMAPPED,
  type NeighborhoodContext,
} from "@/lib/kg/neighborhoods";

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

interface DecisionRow {
  id: string;
  incident_id: string;
  outcome: "act" | "hold" | "dismiss";
  reason: string | null;
  reviewer: string;
  decided_at: string;
}

interface GbrainPageRow {
  id: number;
  slug: string;
  type: string;
  title: string;
  compiled_truth: string;
  frontmatter: {
    legacy_id?: string | null;
    related_incident_id?: string | null;
    related_gang_id?: string | null;
    confidence?: number | string | null;
    samples?: number | null;
    source?: string | null;
  } | null;
  updated_at: string;
  tags: { tag: string }[] | null;
}

interface GbrainRecordView {
  id: string;
  kind: string;
  title: string;
  body: string;
  tags: string[];
  related_incident_id: string | null;
  related_gang_id: string | null;
  confidence: number | string | null;
  samples: number | null;
  source: string;
}

interface GangEventRow {
  id: string;
  gang_id: string | null;
  kind:
    | "sighting"
    | "shooting"
    | "meeting"
    | "recruitment"
    | "arrest"
    | "dispute";
  description: string | null;
  occurred_at: string;
  lat: number | null;
  lng: number | null;
  source: string | null;
  related_incident_id: string | null;
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
    decisionsRes,
    gbrainRes,
    eventsRes,
    audioFiles,
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
    supabase
      .from("decisions")
      .select("id, incident_id, outcome, reason, reviewer, decided_at")
      .order("decided_at", { ascending: false }),
    supabase
      .from("pages")
      .select(
        "id, slug, type, title, compiled_truth, frontmatter, updated_at, tags ( tag )",
      )
      .eq("source_id", "watchdog")
      .order("updated_at", { ascending: false })
      .limit(80),
    supabase
      .from("gang_events")
      .select(
        "id, gang_id, kind, description, occurred_at, lat, lng, source, related_incident_id",
      )
      .order("occurred_at", { ascending: false })
      .limit(40),
    // Real SFPD scanner audio (captured from openmhz.com, stored under
    // /public/dispatch-audio/). KG generates a small snapshot of recent
    // calls using the same simulator that drives the live map.
    scanDispatchAudio(),
  ]);

  const gangs = (gangsRes.data ?? []) as GangRow[];
  const members = (membersRes.data ?? []) as MemberRow[];
  const territories = (territoriesRes.data ?? []) as TerritoryRow[];
  const arrests = (arrestsRes.data ?? []) as ArrestRow[];
  const alerts = (alertsRes.data ?? []) as AlertRow[];
  const incidents = (incidentsRes.data ?? []) as unknown as IncidentRow[];
  const decisions = (decisionsRes.data ?? []) as DecisionRow[];
  const gbrainPages = (gbrainRes.data ?? []) as GbrainPageRow[];
  const gbrainRecords: GbrainRecordView[] = gbrainPages.map((p) => {
    const fm = p.frontmatter ?? {};
    const legacyId = typeof fm.legacy_id === "string" && fm.legacy_id ? fm.legacy_id : String(p.id);
    return {
      id: legacyId,
      kind: p.type,
      title: p.title,
      body: p.compiled_truth,
      tags: (p.tags ?? []).map((t) => t.tag),
      related_incident_id: fm.related_incident_id ?? null,
      related_gang_id: fm.related_gang_id ?? null,
      confidence: fm.confidence ?? null,
      samples: fm.samples ?? null,
      source: fm.source ?? "gbrain",
    };
  });
  const events = (eventsRes.data ?? []) as GangEventRow[];

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

  for (const d of decisions) {
    nodes.push({
      id: `decision:${d.id}`,
      kind: "decision",
      label: d.outcome.toUpperCase(),
      sub: `${d.reviewer} · ${isoToHuman(d.decided_at)}${d.reason ? ` · ${d.reason}` : ""}`,
      meta: {
        outcome: d.outcome,
        reviewer: d.reviewer,
      },
      source: "live",
    });
    edges.push({
      id: `e:inc-decision:${d.id}`,
      source: `inc:${d.incident_id}`,
      target: `decision:${d.id}`,
      label: "decided",
    });
  }

  for (const r of gbrainRecords) {
    if (r.kind === "pattern" || r.kind === "baseline") {
      const meta: Record<string, string | number> = { source: r.source };
      if (r.confidence != null) meta.confidence = Number(r.confidence).toFixed(2);
      if (r.samples != null) meta.samples = r.samples;
      const node: KgNode = {
        id: `gbrain:${r.id}`,
        kind: r.kind,
        label: r.title,
        meta,
        source: "live",
      };
      if (r.tags.length) node.sub = r.tags.join(" · ");
      nodes.push(node);
      if (r.related_incident_id) {
        edges.push({
          id: `e:inc-gbrain:${r.id}`,
          source: `inc:${r.related_incident_id}`,
          target: `gbrain:${r.id}`,
          label: "informs",
        });
      }
      if (r.related_gang_id) {
        edges.push({
          id: `e:gang-gbrain:${r.id}`,
          source: `gang:${r.related_gang_id}`,
          target: `gbrain:${r.id}`,
          label: "context",
        });
      }
    }
    // reviewed_incident kind doesn't appear as its own node — it lives behind
    // the decision node and is queryable via the incident's record list.
  }

  for (const ev of events) {
    const labelByKind: Record<GangEventRow["kind"], string> = {
      sighting: "Sighting",
      shooting: "Shooting",
      meeting: "Meeting",
      recruitment: "Recruitment",
      arrest: "Arrest",
      dispute: "Dispute",
    };
    const eventNode: KgNode = {
      id: `event:${ev.id}`,
      kind: "event",
      label: `${labelByKind[ev.kind]} · ${ev.description ?? "—"}`,
      meta: {
        kind: ev.kind,
        when: isoToHuman(ev.occurred_at),
        source: ev.source ?? "—",
      },
      source: "live",
    };
    if (ev.source) eventNode.sub = `${isoToHuman(ev.occurred_at)} · ${ev.source}`;
    else eventNode.sub = isoToHuman(ev.occurred_at);
    nodes.push(eventNode);

    if (ev.gang_id) {
      edges.push({
        id: `e:gang-event:${ev.id}`,
        source: `gang:${ev.gang_id}`,
        target: `event:${ev.id}`,
        label: ev.kind,
      });
    }
    if (ev.related_incident_id) {
      edges.push({
        id: `e:event-inc:${ev.id}`,
        source: `event:${ev.id}`,
        target: `inc:${ev.related_incident_id}`,
        label: "precedes",
      });
    }
  }

  // Dispatch (audio) nodes — generate a snapshot of recent SFPD scanner
  // calls using the same simulator that drives the live map. KG shows
  // what the operator has been hearing, with seeded neighborhood location
  // nodes for place-of-occurrence context. Capped so the graph stays
  // legible.
  if (audioFiles.length > 0) {
    const kgSim = createSimulatorState(audioFiles);
    const sampleSize = Math.min(20, audioFiles.length * 3);
    for (let i = 0; i < sampleSize; i++) {
      const call = nextDispatchCall(kgSim);
      const placeName = call.neighborhood || call.district || "SF · unknown area";
      const locId = neighborhoodId(placeName);
      if (!seenLocations.has(locId)) {
        nodes.push({
          id: locId,
          kind: "location",
          label: placeName,
          sub: "neighborhood",
          source: "live",
        });
        seenLocations.add(locId);
      }
      nodes.push({
        id: `dispatch:${call.id}`,
        kind: "dispatch",
        label: `${call.callTypeCode ? `${call.callTypeCode} · ` : ""}${call.callType}`,
        sub: `${call.address} · ${call.talkgroup}`,
        meta: {
          priority: priorityLabel(call.priority),
          callNumber: call.callNumber,
          agency: call.agency,
          talkgroup: call.talkgroup,
          urgent: isHighPriority(call.priority) ? "yes" : "no",
          audio: call.fileName,
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

  // --- Derive a neighborhood for every node (Overview+Detail redesign) ---
  const gangNeighborhood = new Map<string, string>();
  for (const g of gangs) {
    const terr = territories.filter((t) => t.gang_id === g.id);
    if (terr.length) {
      const counts = new Map<string, number>();
      for (const t of terr) {
        const nb = nearestHotspot(t.center_lat, t.center_lng);
        counts.set(nb, (counts.get(nb) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) gangNeighborhood.set(`gang:${g.id}`, top[0]);
    }
  }

  const memberToGang = new Map<string, string>();
  for (const m of members) {
    if (m.gang_id) memberToGang.set(`member:${m.id}`, `gang:${m.gang_id}`);
  }

  const incidentNeighborhood = new Map<string, string>();
  for (const i of incidents) {
    const ev = events.find(
      (e) => e.related_incident_id === i.id && e.lat != null && e.lng != null,
    );
    if (ev && ev.lat != null && ev.lng != null) {
      incidentNeighborhood.set(`inc:${i.id}`, nearestHotspot(ev.lat, ev.lng));
      continue;
    }
    if (i.suspect_gang_id) {
      const nb = gangNeighborhood.get(`gang:${i.suspect_gang_id}`);
      if (nb) {
        incidentNeighborhood.set(`inc:${i.id}`, nb);
        continue;
      }
    }
    const cam = i.clips[0]?.cameras ?? null;
    if (cam) {
      const m = matchHotspotByName(`${cam.route} ${cam.description ?? ""}`);
      if (m) incidentNeighborhood.set(`inc:${i.id}`, m);
    }
  }

  const nctx: NeighborhoodContext = {
    gangNeighborhood,
    memberToGang,
    incidentNeighborhood,
  };

  // territories carry coords -> bake into meta so the resolver can use them
  for (const n of nodes) {
    if (n.kind === "territory") {
      const tid = n.id.replace(/^territory:/, "");
      const t = territories.find((x) => x.id === tid);
      if (t) {
        n.meta = { ...(n.meta ?? {}), lat: t.center_lat, lng: t.center_lng };
      }
    }
    if (n.kind === "event") {
      const eid = n.id.replace(/^event:/, "");
      const e = events.find((x) => String(x.id) === eid);
      if (e && e.lat != null && e.lng != null) {
        n.meta = { ...(n.meta ?? {}), lat: e.lat, lng: e.lng };
      }
    }
  }

  // pass 1: gangs, members, incidents, territories, events
  for (const n of nodes) {
    n.neighborhood = resolveNeighborhood(n, nctx);
  }

  // pass 2: alerts/decisions/arrests/baselines/patterns/locations inherit
  // from the incident or gang they connect to via edges
  const nbById = new Map(nodes.map((n) => [n.id, n.neighborhood ?? UNMAPPED]));
  for (const n of nodes) {
    if (n.neighborhood && n.neighborhood !== UNMAPPED) continue;
    const linked = edges.find((e) => e.source === n.id || e.target === n.id);
    if (linked) {
      const other = linked.source === n.id ? linked.target : linked.source;
      const nb = nbById.get(other);
      if (nb && nb !== UNMAPPED) {
        n.neighborhood = nb;
        continue;
      }
    }
    n.neighborhood = UNMAPPED;
  }

  return { nodes, edges };
}
