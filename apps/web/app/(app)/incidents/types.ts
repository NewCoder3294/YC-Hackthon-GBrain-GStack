export type Severity = "low" | "med" | "high";

export interface IncidentRow {
  id: string;
  title: string;
  notes: string | null;
  severity: Severity;
  createdAt: string;
  primaryClip: {
    id: string;
    cameraId: string;
    startedAt: string;
    durationS: number;
    thumbnailPath: string;
    storagePath: string;
    camera: {
      route: string;
      direction: string | null;
      description: string;
      streamUrl: string;
      streamType: "hls" | "mjpeg";
    } | null;
    tags: string[];
  } | null;
}

export interface IncidentDetail extends IncidentRow {
  clips: NonNullable<IncidentRow["primaryClip"]>[];
}

export interface IncidentFilters {
  from?: string;
  to?: string;
  route?: string;
  tag?: string;
  severity?: Severity;
  q?: string;
}

// Dispatch audio entries surfaced in the same incidents table. They're
// projected server-side from the dispatch catalog using a fixed seed
// (stable per build).
export interface DispatchIncidentRow {
  id: string;
  kind: "dispatch";
  title: string;        // call type
  callTypeCode: string;
  priority: string;     // A | B | C | E
  severity: Severity;   // derived from priority
  notes: string;        // address
  neighborhood: string;
  district: string;
  talkgroup: string;
  talkgroupId: string | null;
  audioUrl: string;
  fileName: string;
  createdAt: string;    // recordedAt
}

// Unified discriminated union for the incidents table.
export type IncidentTableRow =
  | ({ kind: "clip" } & IncidentRow)
  | DispatchIncidentRow;
