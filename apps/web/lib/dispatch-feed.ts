import type { AudioFile, DispatchCall } from "./dispatch";
import { pickWeightedHotspot, SF_HOTSPOTS } from "./dispatch-hotspots";
import {
  pickAddressForNeighborhood,
  pickPriorityForCallType,
  pickTalkgroup,
  pickWeightedCallType,
} from "./dispatch-call-types";

// --- Random helpers --------------------------------------------------------

// Mulberry32 PRNG — small, fast, deterministic when seeded. Tests pin a
// seed for reproducibility; runtime uses a per-session entropy source.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleInPlace<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

// Poisson-ish jittered interval around a mean (ms). Clamped so the
// feed tempo stays in a usable range under varying load.
export function jitterInterval(
  meanMs: number,
  rnd: () => number,
  minMs = 4000,
  maxMs = 45_000,
): number {
  const u = Math.max(rnd(), 1e-6);
  const draw = -Math.log(u) * meanMs;
  return Math.max(minMs, Math.min(maxMs, draw));
}

// --- Feed cursor ----------------------------------------------------------

export interface FeedOptions {
  seed?: number;
  meanIntervalMs?: number;
}

export interface FeedCursor {
  catalog: AudioFile[];
  cursor: number;
  lastFile: string | null;
  lastNeighborhood: string | null;
  rnd: () => number;
}

export function createFeedCursor(
  files: AudioFile[],
  opts: FeedOptions = {},
): FeedCursor {
  const seed = opts.seed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffffff));
  const rnd = mulberry32(seed);
  const catalog = shuffleInPlace([...files], rnd);
  return {
    catalog,
    cursor: 0,
    lastFile: null,
    lastNeighborhood: null,
    rnd,
  };
}

export function nextDispatch(state: FeedCursor): DispatchCall {
  if (state.catalog.length === 0) {
    throw new Error("dispatch feed: catalog is empty");
  }

  // Walk the catalog, skipping a slot if the next entry would immediately
  // repeat the last one. With a single-entry catalog the repeat is
  // unavoidable.
  let file = state.catalog[state.cursor]!;
  if (state.catalog.length > 1 && file.file === state.lastFile) {
    state.cursor = (state.cursor + 1) % state.catalog.length;
    file = state.catalog[state.cursor]!;
  }
  state.cursor++;
  if (state.cursor >= state.catalog.length) {
    shuffleInPlace(state.catalog, state.rnd);
    state.cursor = 0;
  }
  state.lastFile = file.file;

  // Avoid the same neighborhood twice in a row when there's a choice.
  let hotspot = pickWeightedHotspot(state.rnd);
  if (SF_HOTSPOTS.length > 1) {
    let attempts = 0;
    while (hotspot.name === state.lastNeighborhood && attempts < 6) {
      hotspot = pickWeightedHotspot(state.rnd);
      attempts++;
    }
  }
  state.lastNeighborhood = hotspot.name;

  // ±~500m jitter so co-located calls don't visually stack on the map.
  const lat = hotspot.lat + (state.rnd() - 0.5) * 0.006;
  const lng = hotspot.lng + (state.rnd() - 0.5) * 0.008;

  // Declared metadata wins; lookup tables fill the gaps.
  const meta = file.meta;
  const callType = meta?.callType ? null : pickWeightedCallType(state.rnd);
  const priority =
    meta?.priority?.toUpperCase() ??
    (callType ? pickPriorityForCallType(callType, state.rnd) : "C");
  const callTypeDesc = meta?.callType ?? callType?.desc ?? "Unknown";
  const callTypeCode = meta?.callTypeCode ?? callType?.code ?? "";
  const neighborhood = meta?.neighborhood ?? hotspot.name;
  const district = meta?.district ?? hotspot.district;
  const address = meta?.address ?? pickAddressForNeighborhood(neighborhood, state.rnd);
  const talkgroup = meta?.talkgroup ?? pickTalkgroup(state.rnd);
  const callNumber = meta?.callNumber ?? nextCallNumber(state.rnd);
  const receivedAt = meta?.time ?? new Date().toISOString();
  const recordedAt = meta?.recordedAt ?? null;
  const talkgroupId = meta?.talkgroupId ?? null;

  return {
    id: `${file.file}:${Date.now()}:${Math.floor(state.rnd() * 1e6)}`,
    audioUrl: file.audioUrl,
    callNumber,
    receivedAt,
    recordedAt,
    callType: callTypeDesc,
    callTypeCode,
    priority,
    address,
    neighborhood,
    district,
    agency: "Police",
    talkgroup,
    talkgroupId,
    lat,
    lng,
    fileName: file.file,
  };
}

function nextCallNumber(rnd: () => number): string {
  // SF CAD numbers are 9 digits, typically leading with 2.
  const head = 2 + Math.floor(rnd() * 7);
  const rest = String(Math.floor(rnd() * 1e8)).padStart(8, "0");
  return `${head}${rest}`;
}
