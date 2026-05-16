import { z } from "zod";

const point = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});

const rawCall = z.object({
  id: z.string(),
  cad_number: z.string().optional(),
  received_datetime: z.string(),
  call_type_final: z.string().optional(),
  call_type_final_desc: z.string().optional(),
  call_type_original: z.string().optional(),
  call_type_original_desc: z.string().optional(),
  priority_final: z.string().optional(),
  priority_original: z.string().optional(),
  agency: z.string().optional(),
  intersection_name: z.string().optional(),
  intersection_point: point.optional(),
  analysis_neighborhood: z.string().optional(),
  police_district: z.string().optional(),
  disposition: z.string().optional(),
});

export const dispatchCallSchema = z.object({
  id: z.string(),
  callNumber: z.string(),
  receivedAt: z.string(),
  callType: z.string(),
  callTypeCode: z.string(),
  priority: z.string(),
  address: z.string(),
  neighborhood: z.string(),
  district: z.string(),
  agency: z.string(),
  disposition: z.string(),
  lat: z.number(),
  lng: z.number(),
});

export type DispatchCall = z.infer<typeof dispatchCallSchema>;

function cleanAddress(name: string | undefined): string {
  if (!name) return "Unknown location";
  return name.replace(/\s*\\\s*/g, " & ").replace(/\s+/g, " ").trim();
}

export function normalizeDispatchCalls(input: unknown): DispatchCall[] {
  if (!Array.isArray(input)) return [];
  const out: DispatchCall[] = [];
  for (const item of input) {
    const parsed = rawCall.safeParse(item);
    if (!parsed.success) continue;
    const r = parsed.data;
    if (!r.intersection_point) continue;
    const [lng, lat] = r.intersection_point.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      id: r.id,
      callNumber: r.cad_number ?? r.id,
      receivedAt: r.received_datetime,
      callType: r.call_type_final_desc ?? r.call_type_original_desc ?? "Unknown",
      callTypeCode: r.call_type_final ?? r.call_type_original ?? "",
      priority: r.priority_final ?? r.priority_original ?? "",
      address: cleanAddress(r.intersection_name),
      neighborhood: r.analysis_neighborhood ?? "",
      district: r.police_district ?? "",
      agency: r.agency ?? "Police",
      disposition: r.disposition ?? "",
      lat,
      lng,
    });
  }
  return out;
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
