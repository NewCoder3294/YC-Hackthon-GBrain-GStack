// Common SFPD call types used to generate plausible metadata when an
// audio file has no manifest entry. Priority weights are realistic-ish
// rather than literal: code 245 (ADW) is almost always A/B, code 588
// (vehicle stop) is almost always C, etc.

export interface CallType {
  code: string;
  desc: string;
  // Weights for priority A / B / C / E (any positive numbers).
  priorityWeight: Readonly<[number, number, number, number]>;
  // Weight in the call-type pool (how often this type comes up).
  weight: number;
}

export const SFPD_CALL_TYPES: CallType[] = [
  { code: "917", desc: "Suspicious person", priorityWeight: [3, 12, 85, 0], weight: 14 },
  { code: "415", desc: "Disturbance", priorityWeight: [8, 22, 70, 0], weight: 12 },
  { code: "586", desc: "Vehicle stop", priorityWeight: [0, 4, 96, 0], weight: 10 },
  { code: "594", desc: "Vandalism", priorityWeight: [0, 10, 90, 0], weight: 8 },
  { code: "488", desc: "Petty theft", priorityWeight: [0, 14, 86, 0], weight: 8 },
  { code: "11550", desc: "Under influence", priorityWeight: [4, 18, 78, 0], weight: 7 },
  { code: "459", desc: "Burglary", priorityWeight: [28, 50, 22, 0], weight: 6 },
  { code: "242", desc: "Battery", priorityWeight: [32, 50, 18, 0], weight: 5 },
  { code: "487", desc: "Grand theft", priorityWeight: [5, 30, 65, 0], weight: 5 },
  { code: "240", desc: "Assault", priorityWeight: [38, 50, 12, 0], weight: 4 },
  { code: "10851", desc: "Auto theft", priorityWeight: [25, 45, 30, 0], weight: 4 },
  { code: "211", desc: "Robbery", priorityWeight: [58, 36, 6, 0], weight: 3 },
  { code: "245", desc: "ADW", priorityWeight: [68, 30, 2, 0], weight: 3 },
  { code: "MEET", desc: "Meet w/citizen", priorityWeight: [0, 5, 95, 0], weight: 5 },
  { code: "WELF", desc: "Welfare check", priorityWeight: [4, 22, 74, 0], weight: 4 },
  { code: "1015", desc: "Vehicle pursuit", priorityWeight: [88, 12, 0, 0], weight: 1 },
  { code: "SHOTS", desc: "Shots fired", priorityWeight: [78, 20, 2, 0], weight: 2 },
];

export const SFPD_TALKGROUPS: string[] = [
  "SFPD Dispatch A1",
  "SFPD Dispatch A2",
  "SFPD Dispatch A3",
  "SFPD Dispatch B1",
  "SFPD Dispatch B2",
  "SFPD Dispatch B3",
  "SFPD Tac 1",
  "SFPD Tac 2",
  "SFPD Tac 4",
  "SFPD Citywide 1",
  "SFPD Citywide 2",
];

const CALL_TYPE_TOTAL = SFPD_CALL_TYPES.reduce((s, c) => s + c.weight, 0);

export function pickWeightedCallType(rnd: () => number = Math.random): CallType {
  let r = rnd() * CALL_TYPE_TOTAL;
  for (const c of SFPD_CALL_TYPES) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return SFPD_CALL_TYPES[0]!;
}

export function pickPriorityForCallType(
  type: CallType,
  rnd: () => number = Math.random,
): "A" | "B" | "C" | "E" {
  const total = type.priorityWeight[0] + type.priorityWeight[1] + type.priorityWeight[2] + type.priorityWeight[3];
  let r = rnd() * total;
  const labels: ("A" | "B" | "C" | "E")[] = ["A", "B", "C", "E"];
  for (let i = 0; i < 4; i++) {
    r -= type.priorityWeight[i]!;
    if (r <= 0) return labels[i]!;
  }
  return "C";
}

export function pickTalkgroup(rnd: () => number = Math.random): string {
  return SFPD_TALKGROUPS[Math.floor(rnd() * SFPD_TALKGROUPS.length)]!;
}

// Plausible intersection labels keyed by neighborhood for realism. Falls
// back to a generic "Near {neighborhood}" if no specific entry is found.
const NEIGHBORHOOD_INTERSECTIONS: Record<string, string[]> = {
  Tenderloin: ["Leavenworth & Turk", "Eddy & Jones", "Ellis & Hyde", "Golden Gate & Larkin"],
  Mission: ["Mission & 16th", "Mission & 24th", "Valencia & 22nd", "Folsom & 20th"],
  "South of Market": ["6th & Howard", "5th & Mission", "7th & Folsom", "Harrison & 4th"],
  "Bayview Hunters Point": ["3rd & Palou", "Quesada & Newhall", "Williams & Mendell"],
  "Financial District": ["Montgomery & Sutter", "Kearny & Pine", "California & Battery"],
  "Western Addition": ["Fillmore & McAllister", "Geary & Divisadero", "Eddy & Webster"],
  "Castro/Upper Market": ["18th & Castro", "Market & Castro", "17th & Sanchez"],
  "Hayes Valley": ["Hayes & Octavia", "Fell & Gough", "Page & Fillmore"],
  "North Beach": ["Columbus & Broadway", "Stockton & Vallejo", "Grant & Green"],
  Excelsior: ["Mission & Geneva", "Geneva & Naples", "Excelsior & Madrid"],
  "Outer Mission": ["Mission & Russia", "Alemany & Mission", "Persia & Mission"],
  Marina: ["Chestnut & Fillmore", "Lombard & Fillmore", "Union & Webster"],
  Sunset: ["Irving & 19th", "Judah & Sunset", "Taraval & 19th"],
  "Visitacion Valley": ["Leland & Cora", "Sunnydale & Hahn", "Visitacion & Tioga"],
  Richmond: ["Geary & Park Presidio", "Clement & 6th", "Balboa & 25th"],
  Chinatown: ["Stockton & Jackson", "Grant & Washington", "Kearny & Clay"],
  "Potrero Hill": ["18th & Connecticut", "20th & Texas", "26th & Wisconsin"],
  "Haight Ashbury": ["Haight & Ashbury", "Haight & Stanyan", "Cole & Page"],
  Lakeshore: ["Ocean & Junipero Serra", "Sloat & 19th"],
  "Twin Peaks": ["Portola & Twin Peaks", "Market & 17th"],
};

export function pickAddressForNeighborhood(
  neighborhood: string,
  rnd: () => number = Math.random,
): string {
  const list = NEIGHBORHOOD_INTERSECTIONS[neighborhood];
  if (!list || list.length === 0) return `Near ${neighborhood}`;
  return list[Math.floor(rnd() * list.length)]!;
}
