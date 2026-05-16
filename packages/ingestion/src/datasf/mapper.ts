/**
 * DataSF SFPD Incident Reports → signal_events mapping (pure).
 *
 * Dataset: Socrata wg3w-h783 ("Police Department Incident Reports: 2018
 * to Present"). This is a confirmed, filed police record stream — it
 * doubles as a Layer-1 ingestion source AND the historical seed/baseline
 * data the GBrain/equity layer needs.
 *
 * Contract decision (flagged for Nick — confirm): `signal_events.source_type`
 * is FIXED at the 4 TRD values; we do NOT widen it (Nick's correlator
 * depends on a stable contract). The least-wrong existing bucket is
 * `call_911` — it is the police-incident/dispatch domain, whereas
 * `citizen_report` is contractually reserved for the web form (its payload
 * MUST carry `channel: 'mobile'|'web'`, which this feed has no honest value
 * for). The TRUE discriminator is `payload.feed = 'datasf_sfpd_incidents'`:
 * the correlator should branch on `payload.feed`, not `source_type`, for
 * this source.
 *
 * No IO here — pure parse/filter/map + a pure dedupe partition, so it is
 * fully unit-testable without network or DB (mirrors calls/generator.ts).
 */

import { z } from "zod";
import type { SignalEventInput } from "../signal-events";

export const DATASF_FEED = "datasf_sfpd_incidents" as const;

/**
 * `call_911` is the least-wrong of the 4 fixed source_type values for a
 * confirmed SFPD incident record. See module header — flagged for Nick.
 */
export const DATASF_SOURCE_TYPE = "call_911" as const;

/**
 * A filed police report is a confirmed record, not a probabilistic
 * detection — so confidence is 1.0 (vs. camera model scores / unverified
 * 911 calls). This lets the correlator weight it as ground truth.
 */
export const DATASF_CONFIDENCE = 1.0 as const;

/**
 * Raw Socrata row. Only row_id + incident_datetime are required; lat/lng
 * are frequently null (anonymized) and filtered out. `passthrough` so new
 * Socrata columns never break parsing.
 */
export const rawIncidentSchema = z
  .object({
    row_id: z.string().min(1),
    incident_datetime: z.string().min(1),
    incident_id: z.string().optional(),
    incident_number: z.string().optional(),
    incident_category: z.string().optional(),
    incident_subcategory: z.string().optional(),
    incident_description: z.string().optional(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    police_district: z.string().optional(),
    analysis_neighborhood: z.string().optional(),
    resolution: z.string().optional(),
  })
  .passthrough();

export type RawIncident = z.infer<typeof rawIncidentSchema>;

export interface MapResult {
  readonly events: SignalEventInput[];
  /** Rows dropped: failed schema, no/invalid geo, or unparseable datetime. */
  readonly skipped: number;
}

function finiteCoord(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim().length === 0) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function mapOne(raw: unknown): SignalEventInput | null {
  const parsed = rawIncidentSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;

  const lat = finiteCoord(r.latitude);
  const lng = finiteCoord(r.longitude);
  // Anonymized rows have null lat/lng — drop them (TRD: real geo only).
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const occurredAt = new Date(r.incident_datetime);
  if (Number.isNaN(occurredAt.getTime())) return null;

  return {
    sourceType: DATASF_SOURCE_TYPE,
    sourceId: r.row_id,
    occurredAt,
    lat,
    lng,
    confidence: DATASF_CONFIDENCE,
    payload: {
      feed: DATASF_FEED,
      incidentId: r.incident_id ?? null,
      incidentNumber: r.incident_number ?? null,
      category: r.incident_category ?? null,
      subcategory: r.incident_subcategory ?? null,
      description: r.incident_description ?? null,
      neighborhood: r.analysis_neighborhood ?? null,
      policeDistrict: r.police_district ?? null,
      resolution: r.resolution ?? null,
    },
  };
}

/** Pure: raw Socrata rows → SignalEventInputs, dropping anonymized/bad rows. */
export function mapIncidents(rawRows: readonly unknown[]): MapResult {
  const events: SignalEventInput[] = [];
  let skipped = 0;
  for (const raw of rawRows) {
    const ev = mapOne(raw);
    if (ev === null) {
      skipped += 1;
      continue;
    }
    events.push(ev);
  }
  return { events, skipped };
}

export interface PartitionResult {
  /** Events whose source_id is neither already in the DB nor a within-batch dup. */
  readonly fresh: SignalEventInput[];
  /** Count dropped as already-present or duplicated within this batch. */
  readonly duplicates: number;
}

/**
 * Pure idempotency partition. `source_id = row_id` (globally unique in the
 * dataset). signal_events has no unique constraint on source_id, so dedup
 * is enforced here: drop anything already in `existingSourceIds` or seen
 * earlier in this same batch. Re-runs become no-ops.
 */
export function partitionNew(
  candidates: readonly SignalEventInput[],
  existingSourceIds: ReadonlySet<string>,
): PartitionResult {
  const fresh: SignalEventInput[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const ev of candidates) {
    if (existingSourceIds.has(ev.sourceId) || seen.has(ev.sourceId)) {
      duplicates += 1;
      continue;
    }
    seen.add(ev.sourceId);
    fresh.push(ev);
  }
  return { fresh, duplicates };
}
