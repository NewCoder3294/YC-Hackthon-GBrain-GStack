import type { AudioFile, DispatchCall } from "./dispatch";
import { pickWeightedHotspot, SF_HOTSPOTS } from "./dispatch-hotspots";
import {
  pickAddressForNeighborhood,
  pickPriorityForCallType,
  pickTalkgroup,
  pickWeightedCallType,
} from "./dispatch-call-types";

// --- Random helpers --------------------------------------------------------

// Mulberry32 PRNG — small, fast, deterministic given a seed. Used so the
// simulator stays deterministic when we want it (tests) but defaults to
// fresh randomness per session.
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

// Poisson-ish jittered interval around a mean (ms). Uses a clamp so we
// never go below MIN_INTERVAL or above MAX_INTERVAL — keeps tempo varied
// but never punishingly fast or boringly slow.
export function jitterInterval(
  meanMs: number,
  rnd: () => number,
  minMs = 4000,
  maxMs = 45_000,
): number {
  // Exponential distribution sample → mean*-ln(U)
  const u = Math.max(rnd(), 1e-6);
  const draw = -Math.log(u) * meanMs;
  return Math.max(minMs, Math.min(maxMs, draw));
}

// --- Core simulator -------------------------------------------------------

export interface SimulatorOptions {
  seed?: number;
  meanIntervalMs?: number;
}

export interface SimulatorState {
  deck: AudioFile[];
  cursor: number;
  lastFile: string | null;
  lastNeighborhood: string | null;
  rnd: () => number;
}

export function createSimulatorState(
  files: AudioFile[],
  opts: SimulatorOptions = {},
): SimulatorState {
  const seed = opts.seed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffffff));
  const rnd = mulberry32(seed);
  const deck = shuffleInPlace([...files], rnd);
  return {
    deck,
    cursor: 0,
    lastFile: null,
    lastNeighborhood: null,
    rnd,
  };
}

export function nextDispatchCall(state: SimulatorState): DispatchCall {
  if (state.deck.length === 0) {
    throw new Error("simulator: empty deck — no audio files available");
  }

  // Pick the next file in the deck, skipping one slot if it would
  // immediately repeat the last call (only matters when deck has >1
  // entry; with a single file we can't avoid the repeat).
  let file = state.deck[state.cursor]!;
  if (state.deck.length > 1 && file.file === state.lastFile) {
    state.cursor = (state.cursor + 1) % state.deck.length;
    file = state.deck[state.cursor]!;
  }
  state.cursor++;
  if (state.cursor >= state.deck.length) {
    shuffleInPlace(state.deck, state.rnd);
    state.cursor = 0;
  }
  state.lastFile = file.file;

  // Pick a hotspot, skipping if same-as-last (when possible).
  let hotspot = pickWeightedHotspot(state.rnd);
  if (SF_HOTSPOTS.length > 1) {
    let attempts = 0;
    while (hotspot.name === state.lastNeighborhood && attempts < 6) {
      hotspot = pickWeightedHotspot(state.rnd);
      attempts++;
    }
  }
  state.lastNeighborhood = hotspot.name;

  // Jitter coords ±~500m so co-located calls don't visually stack.
  const lat = hotspot.lat + (state.rnd() - 0.5) * 0.006;
  const lng = hotspot.lng + (state.rnd() - 0.5) * 0.008;

  // Build call: manifest meta wins, generated values fill the gaps.
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
  const callNumber = meta?.callNumber ?? generateCallNumber(state.rnd);
  const receivedAt = meta?.time ?? new Date().toISOString();
  const recordedAt = meta?.recordedAt ?? null;
  const talkgroupId = meta?.talkgroupId ?? null;

  return {
    id: `sim:${file.file}:${Date.now()}:${Math.floor(state.rnd() * 1e6)}`,
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
    // "generated" means we made everything up; if filename gave us real
    // talkgroup/recorded time, only the call-type metadata is synthetic.
    generated: !meta || meta.callType === undefined,
  };
}

function generateCallNumber(rnd: () => number): string {
  // SF CAD numbers look like 9 digits, leading digit usually 2.
  const head = 2 + Math.floor(rnd() * 7);
  const rest = String(Math.floor(rnd() * 1e8)).padStart(8, "0");
  return `${head}${rest}`;
}
