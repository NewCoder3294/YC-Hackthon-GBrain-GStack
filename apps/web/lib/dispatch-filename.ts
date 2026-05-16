import type { ManifestEntry } from "./dispatch";

// OpenMHz captured filenames look like `sfp25-{talkgroupNum}-{epoch}.m4a`
// (also .mp3/.wav/.ogg/.aac). The epoch is unix seconds when the call was
// recorded. Parsing it gives us real per-file metadata for free, no
// manifest.json required.
const OPENMHZ_PATTERN = /^[a-z0-9]+-(\d+)-(\d{9,11})\.(m4a|mp3|wav|ogg|aac)$/i;

// Known SF Police P25 talkgroup → friendly name. Add as you confirm them
// against radioreference.com / openmhz; unknown talkgroups fall back to
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

export function parseOpenMhzFilename(name: string): FilenameMetadata | null {
  const m = name.match(OPENMHZ_PATTERN);
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

// Merge manifest entry (explicit user-provided) with filename-derived
// metadata (implicit). Explicit always wins.
export function mergeFilenameMeta(
  existing: ManifestEntry | null,
  filename: string,
): ManifestEntry | null {
  const fromName = parseOpenMhzFilename(filename);
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
