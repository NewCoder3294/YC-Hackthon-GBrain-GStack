import type { DispatchCall } from "./dispatch";
import { isHighPriority } from "./dispatch";
import {
  AUTO_DISPATCH_MS,
  OFFICERS,
  type Officer,
  type OperatorEvent,
} from "./events";

// --- Filter: which calls warrant an event on their own ---------------------

// "Always-actionable" call codes — even Priority C of these gets an event.
const ALWAYS_EVENT_CODES = new Set([
  "245", // ADW
  "211", // robbery
  "1015", // pursuit
  "SHOTS",
  "459", // burglary in progress
]);

export function callWarrantsEvent(call: DispatchCall): boolean {
  if (isHighPriority(call.priority)) return true;
  return ALWAYS_EVENT_CODES.has(call.callTypeCode.toUpperCase());
}

// --- Officer assignment ---------------------------------------------------

// Pick an officer with talkgroup affinity to the call's talkgroup, falling
// back to round-robin across the full roster. Avoids assigning the same
// officer back-to-back when possible.
export function pickOfficer(
  call: DispatchCall,
  recentAssignments: string[],
  rnd: () => number = Math.random,
): Officer {
  const tgId = call.talkgroupId ?? "";
  const affinity = OFFICERS.filter((o) => o.talkgroupId === tgId);
  const pool = affinity.length > 0 ? affinity : OFFICERS;

  // Prefer officers not in the recent assignments window.
  const cooled = pool.filter((o) => !recentAssignments.includes(o.id));
  const candidates = cooled.length > 0 ? cooled : pool;
  return candidates[Math.floor(rnd() * candidates.length)]!;
}

// --- Predictions ----------------------------------------------------------

// Patterns the correlation engine watches for. Each detector runs
// over the recent call window and returns a prediction or null.
export interface Prediction {
  reason: string;
  signals: string[];
  confidence: number;
  triggerCall: DispatchCall;
}

interface PredictionContext {
  recentCalls: DispatchCall[]; // sorted newest-first
  alreadyPredicted: Set<string>; // call IDs already used as a trigger
  now: number;
}

// Cluster detector: 3+ calls in the same neighborhood within 10 minutes.
// The freshest call becomes the trigger.
function detectCluster(ctx: PredictionContext): Prediction | null {
  const TENMIN = 10 * 60_000;
  const byNeighborhood = new Map<string, DispatchCall[]>();
  for (const c of ctx.recentCalls) {
    const age = ctx.now - new Date(c.receivedAt).getTime();
    if (age > TENMIN) continue;
    if (!c.neighborhood) continue;
    const list = byNeighborhood.get(c.neighborhood) ?? [];
    list.push(c);
    byNeighborhood.set(c.neighborhood, list);
  }
  for (const [nb, calls] of byNeighborhood) {
    if (calls.length < 3) continue;
    const trigger = calls[0]!;
    if (ctx.alreadyPredicted.has(trigger.id)) continue;
    return {
      reason: `${calls.length} calls in ${nb} in last 10m`,
      signals: calls.slice(0, 4).map((c) => `${c.callTypeCode} · ${c.address}`),
      confidence: Math.min(0.95, 0.55 + calls.length * 0.08),
      triggerCall: trigger,
    };
  }
  return null;
}

// Escalation detector: at least one Priority A and one Priority B in the
// same neighborhood within 5 minutes. Signals coordinated incident.
function detectEscalation(ctx: PredictionContext): Prediction | null {
  const FIVEMIN = 5 * 60_000;
  const byNeighborhood = new Map<string, DispatchCall[]>();
  for (const c of ctx.recentCalls) {
    const age = ctx.now - new Date(c.receivedAt).getTime();
    if (age > FIVEMIN) continue;
    if (!c.neighborhood) continue;
    const list = byNeighborhood.get(c.neighborhood) ?? [];
    list.push(c);
    byNeighborhood.set(c.neighborhood, list);
  }
  for (const [nb, calls] of byNeighborhood) {
    const hasA = calls.some((c) => c.priority.toUpperCase() === "A");
    const hasB = calls.some((c) => c.priority.toUpperCase() === "B");
    if (!hasA || !hasB) continue;
    // Trigger on the freshest A call so it leads.
    const trigger = [...calls]
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
      .find((c) => c.priority.toUpperCase() === "A");
    if (!trigger || ctx.alreadyPredicted.has(trigger.id)) continue;
    return {
      reason: `Coordinated activity in ${nb}: ${calls.length} calls, Priority A+B`,
      signals: calls.slice(0, 4).map((c) => `P${c.priority} · ${c.callTypeCode} · ${c.address}`),
      confidence: 0.78,
      triggerCall: trigger,
    };
  }
  return null;
}

// Hot-talkgroup detector: 4+ calls on the same talkgroup in 8 min. Often
// indicates an unfolding event the dispatcher hasn't formally tagged yet.
function detectHotTalkgroup(ctx: PredictionContext): Prediction | null {
  const EIGHTMIN = 8 * 60_000;
  const byTg = new Map<string, DispatchCall[]>();
  for (const c of ctx.recentCalls) {
    const age = ctx.now - new Date(c.receivedAt).getTime();
    if (age > EIGHTMIN) continue;
    if (!c.talkgroupId) continue;
    const list = byTg.get(c.talkgroupId) ?? [];
    list.push(c);
    byTg.set(c.talkgroupId, list);
  }
  for (const [tgId, calls] of byTg) {
    if (calls.length < 4) continue;
    const trigger = calls[0]!;
    if (ctx.alreadyPredicted.has(trigger.id)) continue;
    return {
      reason: `TG ${tgId} (${trigger.talkgroup}) chatter spike: ${calls.length} calls in 8m`,
      signals: calls.slice(0, 4).map((c) => `${c.callTypeCode} · ${c.address}`),
      confidence: 0.62,
      triggerCall: trigger,
    };
  }
  return null;
}

const DETECTORS: ((ctx: PredictionContext) => Prediction | null)[] = [
  detectEscalation, // highest confidence first
  detectCluster,
  detectHotTalkgroup,
];

export function runPredictions(ctx: PredictionContext): Prediction[] {
  const out: Prediction[] = [];
  const seenTriggers = new Set(ctx.alreadyPredicted);
  for (const detect of DETECTORS) {
    const inner: PredictionContext = { ...ctx, alreadyPredicted: seenTriggers };
    const p = detect(inner);
    if (p) {
      out.push(p);
      seenTriggers.add(p.triggerCall.id);
    }
  }
  return out;
}

// --- Event construction ---------------------------------------------------

let __seq = 0;
function nextEventId(): string {
  __seq = (__seq + 1) % 1_000_000;
  return `evt:${Date.now()}:${__seq}`;
}

export function buildDispatchEvent(
  call: DispatchCall,
  officer: Officer,
  now: number = Date.now(),
): OperatorEvent {
  return {
    id: nextEventId(),
    kind: "dispatch",
    createdAt: new Date(now).toISOString(),
    status: "assigning",
    call,
    reason: null,
    signals: [],
    confidence: null,
    assignedOfficer: officer.name,
    assignedAt: new Date(now).toISOString(),
    autoDispatchAt: new Date(now + AUTO_DISPATCH_MS).toISOString(),
    dispatchedAt: null,
    cancelledAt: null,
    cancelReason: null,
  };
}

export function buildPredictedEvent(
  prediction: Prediction,
  officer: Officer,
  now: number = Date.now(),
): OperatorEvent {
  return {
    id: nextEventId(),
    kind: "predicted",
    createdAt: new Date(now).toISOString(),
    status: "assigning",
    call: prediction.triggerCall,
    reason: prediction.reason,
    signals: prediction.signals,
    confidence: prediction.confidence,
    assignedOfficer: officer.name,
    assignedAt: new Date(now).toISOString(),
    autoDispatchAt: new Date(now + AUTO_DISPATCH_MS).toISOString(),
    dispatchedAt: null,
    cancelledAt: null,
    cancelReason: null,
  };
}
