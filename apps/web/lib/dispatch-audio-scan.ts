import "server-only";
import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import { manifestEntrySchema, type AudioFile, type ManifestEntry } from "./dispatch";
import { mergeFilenameMeta } from "./dispatch-filename";

const AUDIO_EXTENSIONS = new Set([".m4a", ".mp3", ".wav", ".ogg", ".aac"]);
const BUCKET = "dispatch-audio";
const MANIFEST_KEY = "manifest.json";
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  files: AudioFile[];
  expiresAt: number;
}
let cache: CacheEntry | null = null;

export async function scanDispatchAudio(): Promise<AudioFile[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.files;
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return [];

  const supabase = createServiceClient();

  const { data: entries, error } = await supabase.storage.from(BUCKET).list("", {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error || !entries) return [];

  const audioNames = entries
    .map((e) => e.name)
    .filter((name) => AUDIO_EXTENSIONS.has(extname(name).toLowerCase()))
    .sort();

  const manifestByFile = await loadManifest(supabase);
  const publicBase = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;

  const files = audioNames.map((file) => ({
    file,
    audioUrl: `${publicBase}/${encodeURIComponent(file)}`,
    meta: mergeFilenameMeta(manifestByFile.get(file) ?? null, file),
  }));

  cache = { files, expiresAt: Date.now() + CACHE_TTL_MS };
  return files;
}

async function loadManifest(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<Map<string, ManifestEntry>> {
  const out = new Map<string, ManifestEntry>();
  const { data, error } = await supabase.storage.from(BUCKET).download(MANIFEST_KEY);
  if (error || !data) return out;
  try {
    const json = JSON.parse(await data.text());
    if (!Array.isArray(json)) return out;
    for (const item of json) {
      const parsed = manifestEntrySchema.safeParse(item);
      if (parsed.success) out.set(parsed.data.file, parsed.data);
    }
  } catch {
    // Unparseable manifest — fall back to filename metadata.
  }
  return out;
}

function extname(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot);
}
