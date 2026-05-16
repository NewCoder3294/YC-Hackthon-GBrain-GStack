import { z } from "zod";

/**
 * Pure, framework-free helpers for the citizen report ingestion producer.
 *
 * Validation happens at the system boundary (`parseReportInput`) and the row
 * shape is constructed deterministically (`buildSignalEventRow`) so the whole
 * module is trivially unit-testable with no I/O.
 */

export const reportChannelSchema = z.enum(["mobile", "web"]);
export type ReportChannel = z.infer<typeof reportChannelSchema>;

const reportInputSchema = z.object({
  description: z.string().trim().min(1, "description is required"),
  lat: z.coerce.number().min(-90, "lat out of range").max(90, "lat out of range"),
  lng: z.coerce
    .number()
    .min(-180, "lng out of range")
    .max(180, "lng out of range"),
  channel: reportChannelSchema,
  contact: z.string().trim().min(1).optional(),
  photoPath: z.string().trim().min(1).optional(),
});

export type ReportInput = z.infer<typeof reportInputSchema>;

/**
 * Validate and normalize untrusted report input. Throws `z.ZodError` on
 * invalid input — callers at the boundary should catch and map to a 400.
 */
export function parseReportInput(raw: unknown): ReportInput {
  return reportInputSchema.parse(raw);
}

export interface SignalEventPayload {
  channel: ReportChannel;
  description: string;
  contact?: string;
  photo_path?: string;
}

export interface SignalEventRow {
  source_type: "citizen_report";
  source_id: string;
  occurred_at: string;
  lat: number;
  lng: number;
  payload: SignalEventPayload;
  confidence: number | null;
  raw_clip_uri: string | null;
}

export interface BuildRowContext {
  /** Generated report id (uuid) — used as both source_id and storage prefix. */
  id: string;
  /** Capture time; injected for deterministic tests. */
  now: Date;
}

/**
 * Deterministically build the `signal_events` row for one citizen report.
 * Pure: same inputs → same output, no clocks or randomness inside.
 */
export function buildSignalEventRow(
  input: Readonly<ReportInput>,
  { id, now }: Readonly<BuildRowContext>,
): SignalEventRow {
  const payload: SignalEventPayload = {
    channel: input.channel,
    description: input.description,
    ...(input.contact !== undefined ? { contact: input.contact } : {}),
    ...(input.photoPath !== undefined ? { photo_path: input.photoPath } : {}),
  };

  return {
    source_type: "citizen_report",
    source_id: id,
    occurred_at: now.toISOString(),
    lat: input.lat,
    lng: input.lng,
    payload,
    confidence: null,
    raw_clip_uri: input.photoPath ?? null,
  };
}
