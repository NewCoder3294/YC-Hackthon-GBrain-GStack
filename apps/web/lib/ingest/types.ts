/**
 * Wire contract for POST /api/clips/ingest.
 *
 * Producers (e.g. the OpenClaw camera worker) send a multipart/form-data
 * request with these fields. Keep field names stable — they are the public
 * surface this app exposes to the detection pipeline.
 */
export const INGEST_FIELDS = {
  caltransId: "caltrans_id",
  startedAt: "started_at",
  durationS: "duration_s",
  tags: "tags",
  incidentId: "incident_id",
  video: "video",
  thumbnail: "thumbnail",
} as const;

export interface IngestResponse {
  clipId: string;
  storagePath: string;
  thumbnailPath: string;
}

export interface IngestError {
  error: string;
}
