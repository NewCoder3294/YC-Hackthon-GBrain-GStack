// SF Police neighborhood hotspots and weights. Drives map pin
// distribution and address fallbacks when a dispatch entry doesn't
// carry an explicit location. Weights approximate published SFGov
// call-volume share across neighborhoods.

export interface Hotspot {
  name: string;
  district: string;
  lat: number;
  lng: number;
  weight: number;
}

export const SF_HOTSPOTS: Hotspot[] = [
  { name: "Tenderloin", district: "TENDERLOIN", lat: 37.7838, lng: -122.4144, weight: 18 },
  { name: "Mission", district: "MISSION", lat: 37.7599, lng: -122.4148, weight: 15 },
  { name: "South of Market", district: "SOUTHERN", lat: 37.7785, lng: -122.4056, weight: 12 },
  { name: "Bayview Hunters Point", district: "BAYVIEW", lat: 37.7335, lng: -122.3893, weight: 10 },
  { name: "Financial District", district: "CENTRAL", lat: 37.7949, lng: -122.4019, weight: 8 },
  { name: "Western Addition", district: "NORTHERN", lat: 37.7811, lng: -122.4324, weight: 7 },
  { name: "Castro/Upper Market", district: "MISSION", lat: 37.7609, lng: -122.435, weight: 6 },
  { name: "Hayes Valley", district: "NORTHERN", lat: 37.7765, lng: -122.4242, weight: 5 },
  { name: "North Beach", district: "CENTRAL", lat: 37.8008, lng: -122.4106, weight: 5 },
  { name: "Excelsior", district: "INGLESIDE", lat: 37.724, lng: -122.4302, weight: 5 },
  { name: "Outer Mission", district: "INGLESIDE", lat: 37.7173, lng: -122.4527, weight: 4 },
  { name: "Marina", district: "NORTHERN", lat: 37.8036, lng: -122.4368, weight: 4 },
  { name: "Sunset", district: "TARAVAL", lat: 37.7505, lng: -122.494, weight: 4 },
  { name: "Visitacion Valley", district: "INGLESIDE", lat: 37.717, lng: -122.4051, weight: 4 },
  { name: "Richmond", district: "RICHMOND", lat: 37.7805, lng: -122.4839, weight: 3 },
  { name: "Chinatown", district: "CENTRAL", lat: 37.7941, lng: -122.4078, weight: 3 },
  { name: "Potrero Hill", district: "BAYVIEW", lat: 37.7605, lng: -122.4006, weight: 3 },
  { name: "Haight Ashbury", district: "PARK", lat: 37.7702, lng: -122.4467, weight: 3 },
  { name: "Lakeshore", district: "TARAVAL", lat: 37.7269, lng: -122.4895, weight: 2 },
  { name: "Twin Peaks", district: "PARK", lat: 37.7544, lng: -122.4477, weight: 2 },
];

const TOTAL_WEIGHT = SF_HOTSPOTS.reduce((s, h) => s + h.weight, 0);

export function pickWeightedHotspot(rnd: () => number = Math.random): Hotspot {
  let r = rnd() * TOTAL_WEIGHT;
  for (const h of SF_HOTSPOTS) {
    r -= h.weight;
    if (r <= 0) return h;
  }
  return SF_HOTSPOTS[0]!;
}
