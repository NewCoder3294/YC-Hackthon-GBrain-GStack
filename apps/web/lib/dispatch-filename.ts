import type { ManifestEntry } from "./dispatch";

// Trunked radio capture filenames follow the convention
// `{system}-{talkgroupId}-{unixEpochSeconds}.{ext}` (m4a / mp3 / wav /
// ogg / aac). The epoch is the wall-clock time of the call. Parsing the
// filename gives us per-file metadata without a manifest.
const TALKGROUP_FILENAME = /^[a-z0-9]+-(\d+)-(\d{9,11})\.(m4a|mp3|wav|ogg|aac)$/i;

// SF Police P25 talkgroup → friendly name. Unknown IDs fall back to
// "Talkgroup {n}".
const SFPD_TALKGROUP_NAMES: Record<string, string> = {
  "804": "SFPD Co. A (Central)",
  "808": "SFPD Co. B (Mission)",
  "812": "SFPD Co. C (Bayview)",
  "816": "SFPD Co. D (Tenderloin)",
};

export interface FilenameMetadata {
  talkgroupId: string;
  talkgroupName: string;
  recordedAt: string;
}

export function parseTalkgroupFilename(name: string): FilenameMetadata | null {
  const m = name.match(TALKGROUP_FILENAME);
  if (!m) return null;
  const talkgroupId = m[1]!;
  const epochSec = Number(m[2]!);
  if (!Number.isFinite(epochSec) || epochSec <= 0) return null;
  return {
    talkgroupId,
    talkgroupName: SFPD_TALKGROUP_NAMES[talkgroupId] ?? `Talkgroup ${talkgroupId}`,
    recordedAt: new Date(epochSec * 1000).toISOString(),
  };
}

// Merge a declared manifest entry with metadata derived from the
// filename. Declared always wins; derived fills the gaps.
export function mergeFilenameMeta(
  existing: ManifestEntry | null,
  filename: string,
): ManifestEntry | null {
  const fromName = parseTalkgroupFilename(filename);
  if (!fromName && !existing) return null;
  const base: ManifestEntry = existing ?? { file: filename };
  if (!fromName) return base;
  return {
    ...base,
    talkgroup: base.talkgroup ?? fromName.talkgroupName,
    talkgroupId: base.talkgroupId ?? fromName.talkgroupId,
    recordedAt: base.recordedAt ?? fromName.recordedAt,
  };
}
