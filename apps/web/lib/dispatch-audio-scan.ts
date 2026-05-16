import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { manifestEntrySchema, type AudioFile, type ManifestEntry } from "./dispatch";
import { mergeFilenameMeta } from "./dispatch-filename";

const AUDIO_EXTENSIONS = new Set([".m4a", ".mp3", ".wav", ".ogg", ".aac"]);
const PUBLIC_RELATIVE = "public/dispatch-audio";

export async function scanDispatchAudio(): Promise<AudioFile[]> {
  const folder = path.join(process.cwd(), PUBLIC_RELATIVE);
  let entries: string[];
  try {
    entries = await readdir(folder);
  } catch {
    return [];
  }

  const audioFiles = entries.filter((name) =>
    AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase()),
  );

  const manifestByFile = await loadManifest(folder);

  return audioFiles
    .sort()
    .map((file) => ({
      file,
      audioUrl: `/dispatch-audio/${encodeURIComponent(file)}`,
      // Explicit manifest wins; filename metadata fills gaps automatically
      // for OpenMHz-style names like `sfp25-{tg}-{epoch}.m4a`.
      meta: mergeFilenameMeta(manifestByFile.get(file) ?? null, file),
    }));
}

async function loadManifest(folder: string): Promise<Map<string, ManifestEntry>> {
  const out = new Map<string, ManifestEntry>();
  try {
    const raw = await readFile(path.join(folder, "manifest.json"), "utf-8");
    const json = JSON.parse(raw);
    if (!Array.isArray(json)) return out;
    for (const item of json) {
      const parsed = manifestEntrySchema.safeParse(item);
      if (parsed.success) out.set(parsed.data.file, parsed.data);
    }
  } catch {
    // No manifest.json (or unparseable) — that's fine, we'll generate.
  }
  return out;
}
