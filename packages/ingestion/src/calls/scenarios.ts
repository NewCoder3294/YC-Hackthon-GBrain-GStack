/**
 * Scripted 911 call scenarios for the WatchDog demo (TRD §8).
 *
 * These are NOT live 911 feeds — there is no public 911 audio API. For the
 * hackathon demo we replay a deterministic, hand-authored timeline of San
 * Francisco calls so the operator can show the correlator lighting up on
 * cue. The canonical seed narrative is Hunters Point / Bayview gang
 * activity (Gang A vs Gang B) with a parallel Mission District thread.
 *
 * Each scenario is zod-validated at module load so a typo in a coordinate
 * or a missing field fails fast instead of silently producing a bad
 * signal_event.
 *
 * Coordinates are real SF locations:
 *   - Mission & 16th        ~37.7649, -122.4194
 *   - Hunters Point/Bayview ~37.7299, -122.3829
 *   - Mission / Bayview surrounding blocks vary slightly per call.
 */

import { z } from "zod";

export const scenarioSchema = z.object({
  /** Stable id — used as signal_events.sourceId and for `--id` triggering. */
  id: z.string().min(1),
  /** Verbatim caller/dispatcher transcript fed to the summarizer. */
  transcript: z.string().min(1),
  lat: z.number().finite().gte(-90).lte(90),
  lng: z.number().finite().gte(-180).lte(180),
  /** Seconds after timeline start that this call fires (>= 0). */
  offsetSeconds: z.number().finite().nonnegative(),
  /** Whether the caller disconnected before dispatch finished. */
  callerHungUp: z.boolean(),
  /** Operator-relevant keywords; also used by the fallback summarizer. */
  keywords: z.array(z.string().min(1)).min(1),
});

export type Scenario = z.infer<typeof scenarioSchema>;

/**
 * Raw scenario list. Kept private; consumers import the validated `SCENARIOS`.
 * Ordered loosely by offset for readability — `scheduleScenarios` re-sorts.
 */
const RAW_SCENARIOS: readonly Scenario[] = [
  {
    id: "sf-911-mission-16th-fight",
    transcript:
      "911, what's your emergency? — There's a fight outside the BART plaza at " +
      "Mission and 16th, like four or five guys, somebody's got a — [shouting] " +
      "— he's bleeding, someone's on the ground, you need to send — [call ends]",
    lat: 37.7649,
    lng: -122.4194,
    offsetSeconds: 0,
    callerHungUp: true,
    keywords: ["assault", "fight", "weapon", "injury", "mission", "bart"],
  },
  {
    id: "sf-911-hunterspoint-shots-fired",
    transcript:
      "911 emergency. — Shots fired, shots fired near Innes and Earl in " +
      "Hunters Point. A dark sedan just sped off northbound, four people " +
      "inside, I heard maybe six shots. There's a guy down by the corner " +
      "store, please hurry.",
    lat: 37.7299,
    lng: -122.3829,
    offsetSeconds: 25,
    callerHungUp: false,
    keywords: [
      "shots fired",
      "gunfire",
      "vehicle fled",
      "sedan",
      "hunters point",
      "victim down",
    ],
  },
  {
    id: "sf-911-bayview-noise-disturbance",
    transcript:
      "Non-emergency, but — there's a lot of yelling and what sounded like " +
      "firecrackers behind the building on Quesada. Could be nothing, maybe " +
      "kids? I can't really see anything from my window. Just thought I'd " +
      "report it.",
    lat: 37.7338,
    lng: -122.3861,
    offsetSeconds: 40,
    callerHungUp: false,
    keywords: ["disturbance", "noise", "ambiguous", "bayview", "unconfirmed"],
  },
  {
    id: "sf-911-hunterspoint-group-armed",
    transcript:
      "911. — There's a group of maybe eight guys gathering on Palou near " +
      "Third, some of them have their hands in their waistbands, it looks " +
      "like it's about to pop off between two crews. You need units here " +
      "before someone gets shot.",
    lat: 37.7311,
    lng: -122.3895,
    offsetSeconds: 60,
    callerHungUp: false,
    keywords: [
      "gang",
      "armed",
      "group",
      "escalation",
      "hunters point",
      "weapon",
    ],
  },
  {
    id: "sf-911-mission-24th-robbery",
    transcript:
      "911 what's your emergency — I just got robbed at 24th and Mission, " +
      "two guys, one had a knife, they took my phone and ran toward Capp " +
      "Street. I'm okay but they're still out there, gray hoodie and a red " +
      "backpack.",
    lat: 37.7524,
    lng: -122.4181,
    offsetSeconds: 90,
    callerHungUp: false,
    keywords: ["robbery", "knife", "suspect fled", "mission", "theft"],
  },
  {
    id: "sf-911-hunterspoint-shots-followup",
    transcript:
      "Yeah I called a minute ago about Innes and Earl — they came back, " +
      "the same dark sedan, more shots, I think the two crews are " +
      "shooting at each other now. People are running. [muffled] — I have " +
      "to go — [call ends]",
    lat: 37.7305,
    lng: -122.3838,
    offsetSeconds: 115,
    callerHungUp: true,
    keywords: [
      "shots fired",
      "gang",
      "repeat caller",
      "sedan",
      "hunters point",
      "gunfire",
    ],
  },
  {
    id: "sf-911-bayview-medical-secondary",
    transcript:
      "911 — there's someone on the sidewalk on Newcomb not moving, I think " +
      "he was one of the people from the shooting a few blocks over. He's " +
      "breathing but there's blood. Send an ambulance, please.",
    lat: 37.7349,
    lng: -122.389,
    offsetSeconds: 140,
    callerHungUp: false,
    keywords: ["medical", "victim down", "ambulance", "bayview", "injury"],
  },
  {
    id: "sf-911-mission-noise-falsealarm",
    transcript:
      "Hi, sorry — I called about a possible break-in on Valencia but it was " +
      "just my neighbor moving furniture. False alarm, you can cancel that. " +
      "Sorry to bother you.",
    lat: 37.7599,
    lng: -122.4214,
    offsetSeconds: 170,
    callerHungUp: false,
    keywords: ["false alarm", "cancelled", "ambiguous", "mission", "noise"],
  },
];

/**
 * Module-load-validated scenarios. Throws immediately on any malformed
 * entry — we want a bad demo script to fail before the worker boots, not
 * mid-presentation.
 */
export const SCENARIOS: readonly Scenario[] = Object.freeze(
  z.array(scenarioSchema).min(1).parse(RAW_SCENARIOS),
);

/** Lookup helper for the `--id` single-shot worker mode. */
export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
