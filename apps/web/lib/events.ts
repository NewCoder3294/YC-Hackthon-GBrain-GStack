import type { DispatchCall } from "./dispatch";

// One operator-facing event in the live feed (bottom-right of the map).
// Created either from a single dispatch call (the priority/type warrants
// action on its own) or from a GBrain prediction that synthesized across
// multiple signals.
export type EventKind = "dispatch" | "predicted";

// Lifecycle:
//   incoming  → just appeared, no officer yet
//   assigning → officer assigned, countdown running, will auto-dispatch
//   dispatched → countdown hit zero (or user pressed Dispatch now)
//   cancelled → user killed it
export type EventStatus = "incoming" | "assigning" | "dispatched" | "cancelled";

export interface OperatorEvent {
  id: string;
  kind: EventKind;
  createdAt: string;
  status: EventStatus;

  // Primary triggering call (every event has one).
  call: DispatchCall;

  // For "predicted" events: which signals contributed and why.
  reason: string | null;
  signals: string[];
  confidence: number | null;

  // Assignment state.
  assignedOfficer: string | null;
  assignedAt: string | null;
  // Wall-clock time the auto-dispatch fires. UI shows "Auto-dispatch in
  // {ms-until}" and ticks visually.
  autoDispatchAt: string | null;
  dispatchedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

// Synthetic officer roster. Names + companies match the four active
// SFPD talkgroups (Co. A/B/C/D) shown in the audio metadata so the
// auto-assignment reads as district-aware.
export interface Officer {
  id: string;
  name: string;
  company: "Co. A" | "Co. B" | "Co. C" | "Co. D";
  // Talkgroup ID this officer typically rides on — used for affinity
  // when auto-assigning so a Bayview call (TG 812) usually gets a Co. C
  // officer, not random.
  talkgroupId: string;
}

export const OFFICERS: Officer[] = [
  { id: "off:1", name: "Off. Chen 4A12", company: "Co. A", talkgroupId: "804" },
  { id: "off:2", name: "Off. Diaz 4A18", company: "Co. A", talkgroupId: "804" },
  { id: "off:3", name: "Off. Park 4A23", company: "Co. A", talkgroupId: "804" },
  { id: "off:4", name: "Off. Martinez 4B07", company: "Co. B", talkgroupId: "808" },
  { id: "off:5", name: "Off. Nguyen 4B14", company: "Co. B", talkgroupId: "808" },
  { id: "off:6", name: "Off. Reyes 4B21", company: "Co. B", talkgroupId: "808" },
  { id: "off:7", name: "Off. Williams 4C03", company: "Co. C", talkgroupId: "812" },
  { id: "off:8", name: "Off. Brooks 4C11", company: "Co. C", talkgroupId: "812" },
  { id: "off:9", name: "Off. Romero 4C19", company: "Co. C", talkgroupId: "812" },
  { id: "off:10", name: "Off. Patel 4D05", company: "Co. D", talkgroupId: "816" },
  { id: "off:11", name: "Off. Kim 4D13", company: "Co. D", talkgroupId: "816" },
  { id: "off:12", name: "Off. Hall 4D22", company: "Co. D", talkgroupId: "816" },
];

// Default countdown until an auto-assigned event self-dispatches. The
// user can Cancel / Reassign / Dispatch-now before this expires.
export const AUTO_DISPATCH_MS = 30_000;

// Cap on the live feed.
export const MAX_FEED_EVENTS = 12;
