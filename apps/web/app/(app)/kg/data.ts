import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { KgEdge, KgNode } from "@/components/kg/types";

interface LiveIncidentRow {
  id: string;
  title: string;
  notes: string | null;
  severity: "low" | "med" | "high";
  created_at: string;
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

export async function loadLiveKgNodes(): Promise<{
  nodes: KgNode[];
  edges: KgEdge[];
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incidents")
    .select(
      "id, title, notes, severity, created_at, clips (cameras (route, direction, description))",
    )
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    console.error("loadLiveKgNodes:", error.message);
    return { nodes: [], edges: [] };
  }
  const rows = (data ?? []) as unknown as LiveIncidentRow[];

  const nodes: KgNode[] = [];
  const edges: KgEdge[] = [];
  const seenLocations = new Set<string>();

  for (const row of rows) {
    const cam = row.clips[0]?.cameras ?? null;
    const sev = row.severity === "high" ? 0.83 : row.severity === "med" ? 0.55 : 0.3;
    const incidentNode: KgNode = {
      id: `inc:live:${row.id}`,
      kind: "incident",
      label: row.title,
      sub: `${row.created_at.slice(0, 16).replace("T", " ")}${cam ? ` · ${cam.route}${cam.direction ? ` ${cam.direction}` : ""}` : ""}`,
      meta: {
        severity: sev.toFixed(2),
        signals: cam ? "1" : "0",
      },
      source: "live",
    };
    nodes.push(incidentNode);

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
        id: `e:loc-inc:${row.id}`,
        source: locId,
        target: incidentNode.id,
      });
    }
  }

  return { nodes, edges };
}
