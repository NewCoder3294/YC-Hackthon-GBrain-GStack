import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { IncidentDetail, IncidentFilters, IncidentRow, Severity } from "./types";

interface ClipRow {
  id: string;
  camera_id: string;
  started_at: string;
  duration_s: number;
  thumbnail_path: string;
  storage_path: string;
  cameras: {
    route: string;
    direction: string | null;
    description: string;
  } | null;
  clip_tags: { tag: string }[];
}

interface IncidentResponse {
  id: string;
  title: string;
  notes: string | null;
  severity: Severity;
  created_at: string;
  clips: ClipRow[];
}

const CLIP_SELECT =
  "id, camera_id, started_at, duration_s, thumbnail_path, storage_path, cameras (route, direction, description), clip_tags (tag)";

function toClip(c: ClipRow) {
  return {
    id: c.id,
    cameraId: c.camera_id,
    startedAt: c.started_at,
    durationS: c.duration_s,
    thumbnailPath: c.thumbnail_path,
    storagePath: c.storage_path,
    camera: c.cameras
      ? {
          route: c.cameras.route,
          direction: c.cameras.direction,
          description: c.cameras.description,
        }
      : null,
    tags: c.clip_tags.map((t) => t.tag),
  };
}

function pickPrimary(clips: ClipRow[]) {
  if (clips.length === 0) return null;
  const sorted = [...clips].sort((a, b) =>
    a.started_at < b.started_at ? -1 : 1,
  );
  const first = sorted[0];
  return first ? toClip(first) : null;
}

export async function listIncidents(
  filters: IncidentFilters,
): Promise<IncidentRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("incidents")
    .select(`id, title, notes, severity, created_at, clips (${CLIP_SELECT})`)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);
  if (filters.q) {
    const term = `%${filters.q}%`;
    query = query.or(`title.ilike.${term},notes.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listIncidents: ${error.message}`);

  const rows = (data ?? []) as unknown as IncidentResponse[];
  const mapped = rows.map<IncidentRow>((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    severity: r.severity,
    createdAt: r.created_at,
    primaryClip: pickPrimary(r.clips),
  }));

  return mapped.filter((row) => {
    if (filters.route) {
      if (row.primaryClip?.camera?.route !== filters.route) return false;
    }
    if (filters.tag) {
      if (!row.primaryClip?.tags.includes(filters.tag)) return false;
    }
    return true;
  });
}

export async function getIncident(id: string): Promise<IncidentDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incidents")
    .select(`id, title, notes, severity, created_at, clips (${CLIP_SELECT})`)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getIncident: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as IncidentResponse;
  const clips = [...row.clips]
    .sort((a, b) => (a.started_at < b.started_at ? -1 : 1))
    .map(toClip);

  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    severity: row.severity,
    createdAt: row.created_at,
    primaryClip: clips[0] ?? null,
    clips,
  };
}

export async function listDistinctRoutes(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cameras")
    .select("route")
    .order("route");
  if (error) return [];
  const set = new Set<string>();
  for (const row of data ?? []) set.add(row.route as string);
  return [...set];
}

export async function listDistinctTags(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clip_tags").select("tag");
  if (error) return [];
  const set = new Set<string>();
  for (const row of data ?? []) set.add(row.tag as string);
  return [...set].sort();
}

export async function getClipSignedUrl(
  storagePath: string,
  expiresInSeconds = 600,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("clips")
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function thumbnailUrl(thumbnailPath: string): string {
  if (!thumbnailPath) return "";
  if (thumbnailPath.startsWith("http")) return thumbnailPath;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/storage/v1/object/public/thumbnails/${thumbnailPath}`;
}
