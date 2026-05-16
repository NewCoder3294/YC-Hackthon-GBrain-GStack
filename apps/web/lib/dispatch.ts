import { z } from "zod";

// A single dispatch call surfaced on the map. Now backed by a real audio
// file from the dispatch-audio folder (captured from openmhz.com) rather
// than text-to-speech of SFGov metadata.
export const dispatchCallSchema = z.object({
  id: z.string(),
  audioUrl: z.string(),
  callNumber: z.string(),
  receivedAt: z.string(),
  callType: z.string(),
  callTypeCode: z.string(),
  priority: z.string(),
  address: z.string(),
  neighborhood: z.string(),
  district: z.string(),
  agency: z.string(),
  talkgroup: z.string(),
  lat: z.number(),
  lng: z.number(),
  fileName: z.string(),
  generated: z.boolean(),
});

export type DispatchCall = z.infer<typeof dispatchCallSchema>;

export const manifestEntrySchema = z.object({
  file: z.string(),
  callType: z.string().optional(),
  callTypeCode: z.string().optional(),
  priority: z.string().optional(),
  talkgroup: z.string().optional(),
  address: z.string().optional(),
  neighborhood: z.string().optional(),
  district: z.string().optional(),
  callNumber: z.string().optional(),
  time: z.string().optional(),
});

export type ManifestEntry = z.infer<typeof manifestEntrySchema>;

export interface AudioFile {
  file: string;
  audioUrl: string;
  meta: ManifestEntry | null;
}

export function priorityLabel(p: string): string {
  const map: Record<string, string> = {
    A: "Priority A (emergency)",
    B: "Priority B (urgent)",
    C: "Priority C (routine)",
    E: "Priority E (cold)",
  };
  return map[p.toUpperCase()] ?? (p ? `Priority ${p}` : "Unknown priority");
}

export function isHighPriority(p: string): boolean {
  const upper = p.toUpperCase();
  return upper === "A" || upper === "B";
}
