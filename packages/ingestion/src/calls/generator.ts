/**
 * Pure 911 timeline logic (no IO) — unit-testable in isolation.
 *
 *  - `scheduleScenarios` turns scenario offsets into absolute fire times,
 *    optionally compressed by a `speed` factor so a multi-minute scripted
 *    timeline fits inside a 3-minute live demo (TRD §8).
 *  - `toSignalEvent` maps a scenario + its summary onto the shared
 *    `SignalEventInput` contract. Kept pure so the worker just wires IO
 *    around it.
 */

import type { SignalEventInput } from "../signal-events";
import type { Scenario } from "./scenarios";
import type { TranscriptSummary } from "./summarize";

export interface ScheduledCall {
  scenario: Scenario;
  /** Absolute wall-clock time this call should fire. */
  fireAt: Date;
}

/**
 * Order scenarios by offset and compute absolute fire times.
 *
 * `fireAt = startAt + (offsetSeconds / speed)`. speed=1 plays real time;
 * speed=10 compresses a 170s script into 17s. speed must be > 0.
 */
export function scheduleScenarios(
  scenarios: readonly Scenario[],
  startAt: Date,
  speed = 1,
): ScheduledCall[] {
  if (!(speed > 0) || !Number.isFinite(speed)) {
    throw new Error(`scheduleScenarios: speed must be > 0, got ${speed}`);
  }
  const start = startAt.getTime();
  return [...scenarios]
    .sort((a, b) => a.offsetSeconds - b.offsetSeconds)
    .map((scenario) => ({
      scenario,
      fireAt: new Date(start + (scenario.offsetSeconds / speed) * 1000),
    }));
}

/**
 * Map a scripted scenario + its summary onto the Layer-1 contract.
 *
 * confidence is null — a 911 call is a human report, not a scored
 * detection, so there is no meaningful model confidence to attach.
 */
export function toSignalEvent(
  scenario: Scenario,
  summary: TranscriptSummary,
  occurredAt: Date,
): SignalEventInput {
  return {
    sourceType: "call_911",
    sourceId: scenario.id,
    occurredAt,
    lat: scenario.lat,
    lng: scenario.lng,
    payload: {
      transcript: scenario.transcript,
      summary: summary.summary,
      keywords: summary.keywords,
      callerHungUp: scenario.callerHungUp,
      summaryFromModel: summary.fromModel,
    },
    confidence: null,
    rawClipUri: null,
  };
}
