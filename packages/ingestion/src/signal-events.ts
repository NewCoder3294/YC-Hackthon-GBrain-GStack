/**
 * The Layer-1 ingestion contract (TRD §3.1 / §6).
 *
 * Every producer — Caltrans camera detector, 911 transcript generator,
 * citizen report form — constructs a `SignalEventInput` and writes it
 * via `insertSignalEvents`. Nick's correlator reads `signal_events`.
 * This module is the ONLY coupling point between producers; do not add
 * producer-specific logic here.
 */

import { signalEvents, type Db, type NewSignalEvent } from "@caltrans/db";
import { z } from "zod";

export const SOURCE_TYPES = [
  "camera_public",
  "camera_private",
  "call_911",
  "citizen_report",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * Producer-facing input. `occurredAt` is a real Date; `payload` is the
 * source-specific JSON detail. For citizen_report, payload MUST include
 * `channel: "mobile" | "web"` (TRD §2).
 */
export const signalEventInputSchema = z.object({
  sourceType: z.enum(SOURCE_TYPES),
  sourceId: z.string().min(1),
  occurredAt: z.date(),
  lat: z.number().finite().gte(-90).lte(90),
  lng: z.number().finite().gte(-180).lte(180),
  payload: z.record(z.unknown()),
  confidence: z.number().min(0).max(1).nullish(),
  rawClipUri: z.string().min(1).nullish(),
});

export type SignalEventInput = z.input<typeof signalEventInputSchema>;

function toRow(input: SignalEventInput): NewSignalEvent {
  const v = signalEventInputSchema.parse(input);
  return {
    sourceType: v.sourceType,
    sourceId: v.sourceId,
    occurredAt: v.occurredAt,
    lat: v.lat,
    lng: v.lng,
    payload: v.payload,
    confidence: v.confidence ?? null,
    rawClipUri: v.rawClipUri ?? null,
  };
}

/** Pure mapper, exported for unit tests (no DB needed). */
export function buildSignalEventRows(
  inputs: readonly SignalEventInput[],
): NewSignalEvent[] {
  return inputs.map(toRow);
}

/**
 * Validate + insert. Returns inserted row ids. Throws on validation or
 * DB error — producers decide whether to retry or drop.
 */
export async function insertSignalEvents(
  db: Db,
  inputs: readonly SignalEventInput[],
): Promise<string[]> {
  if (inputs.length === 0) return [];
  const rows = buildSignalEventRows(inputs);
  const inserted = await db
    .insert(signalEvents)
    .values(rows)
    .returning({ id: signalEvents.id });
  return inserted.map((r) => r.id);
}
