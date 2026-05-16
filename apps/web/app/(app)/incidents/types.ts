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
