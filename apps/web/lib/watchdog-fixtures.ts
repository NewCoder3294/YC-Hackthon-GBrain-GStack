// Synthetic WatchDog dataset shared by /map and /kg.
// Replace with live fusion-engine output once the GBrain pipeline writes here.

export type Severity = "low" | "med" | "high";
export type SignalKind = "camera" | "call_911" | "citizen_report" | "shotspotter";

export interface WdSignal {
  id: string;
  kind: SignalKind;
  occurredAt: string; // ISO
  lat: number;
  lng: number;
  label: string;
}

export interface WdIncident {
  id: string;
  title: string;
  type: string;
  severity: Severity;
  lat: number;
  lng: number;
  earliestSignalAt: string;
  status: "open" | "acted" | "held" | "dismissed";
  decisionReason?: string;
  priorContext: string[]; // free-text notes surfaced from GBrain
  signals: WdSignal[];
}

const t = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const wdIncidents: WdIncident[] = [
  {
    id: "wd:inc:mission",
    title: "Possible assault",
    type: "possible_assault",
    severity: "high",
    lat: 37.7649,
    lng: -122.4194,
    earliestSignalAt: t(3),
    status: "open",
    priorContext: [
      "Mission & 16th — 4 of last 5 'cam+911 ≤30s' patterns dismissed as false-positive",
      "Neighborhood baseline: 0.4 violent calls / wk · current week at 3",
    ],
    signals: [
      {
        id: "wd:sig:m1",
        kind: "camera",
        occurredAt: t(3),
        lat: 37.7649,
        lng: -122.4194,
        label: "Detection: fighting (0.71)",
      },
      {
        id: "wd:sig:m2",
        kind: "call_911",
        occurredAt: t(2.5),
        lat: 37.7652,
        lng: -122.4191,
        label: "911 hangup",
      },
      {
        id: "wd:sig:m3",
        kind: "citizen_report",
        occurredAt: t(1),
        lat: 37.7645,
        lng: -122.4198,
        label: "Citizen report · 'loud argument'",
      },
    ],
  },
  {
    id: "wd:inc:tenderloin",
    title: "Disturbance",
    type: "disturbance",
    severity: "med",
    lat: 37.7836,
    lng: -122.4131,
    earliestSignalAt: t(18),
    status: "held",
    decisionReason: "Pending corroboration",
    priorContext: [
      "Pattern: 'running' detection alone · dismiss-rate 0.91 (47 samples)",
    ],
    signals: [
      {
        id: "wd:sig:t1",
        kind: "camera",
        occurredAt: t(18),
        lat: 37.7836,
        lng: -122.4131,
        label: "Detection: running (0.62)",
      },
      {
        id: "wd:sig:t2",
        kind: "shotspotter",
        occurredAt: t(17.7),
        lat: 37.784,
        lng: -122.4128,
        label: "ShotSpotter — single report",
      },
    ],
  },
  {
    id: "wd:inc:soma",
    title: "Vehicle collision",
    type: "vehicle_collision",
    severity: "high",
    lat: 37.778,
    lng: -122.4054,
    earliestSignalAt: t(42),
    status: "acted",
    decisionReason: "Ambulance dispatched",
    priorContext: [
      "SoMa core baseline: 1.2 collisions / wk · current week at 1 (within range)",
    ],
    signals: [
      {
        id: "wd:sig:s1",
        kind: "camera",
        occurredAt: t(42),
        lat: 37.778,
        lng: -122.4054,
        label: "Detection: collision (0.88)",
      },
      {
        id: "wd:sig:s2",
        kind: "call_911",
        occurredAt: t(41.7),
        lat: 37.7782,
        lng: -122.4051,
        label: "911 — 'two-car crash'",
      },
      {
        id: "wd:sig:s3",
        kind: "call_911",
        occurredAt: t(41.5),
        lat: 37.7778,
        lng: -122.4057,
        label: "911 — 'injuries'",
      },
      {
        id: "wd:sig:s4",
        kind: "citizen_report",
        occurredAt: t(40),
        lat: 37.7785,
        lng: -122.4049,
        label: "Citizen report · photo attached",
      },
    ],
  },
  {
    id: "wd:inc:civic",
    title: "Crowd swell",
    type: "crowd_anomaly",
    severity: "low",
    lat: 37.7793,
    lng: -122.4193,
    earliestSignalAt: t(75),
    status: "dismissed",
    decisionReason: "Permitted demonstration",
    priorContext: [
      "Civic Center area · permitted events common between 14:00–18:00",
    ],
    signals: [
      {
        id: "wd:sig:c1",
        kind: "camera",
        occurredAt: t(75),
        lat: 37.7793,
        lng: -122.4193,
        label: "Crowd density above threshold",
      },
      {
        id: "wd:sig:c2",
        kind: "citizen_report",
        occurredAt: t(70),
        lat: 37.7795,
        lng: -122.419,
        label: "Citizen — 'rally near Civic Center'",
      },
    ],
  },
];
