// Centroid lookup for SF Analysis Neighborhoods.
//
// DataSF's SFPD CAD feed (`gnap-fj3t`) does not always return lat/lng;
// it sometimes only includes `analysis_neighborhood` text. When the
// intersection_point is missing we fall back to the neighborhood centroid
// and tag the row as `geo_precision='neighborhood'` so the UI can render
// it visually distinct from intersection-precise pins.
//
// Source of centroids: hand-derived from DataSF Analysis Neighborhoods
// polygon dataset (resource `p5b7-5n3h`). Approximate to 4 decimals
// (~11m), which is well inside the neighborhood polygon for all 41 SF
// analysis neighborhoods.
export const SF_NEIGHBORHOOD_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  "Bayview Hunters Point": { lat: 37.7297, lng: -122.3934 },
  "Bernal Heights": { lat: 37.7398, lng: -122.4148 },
  "Castro/Upper Market": { lat: 37.7609, lng: -122.4350 },
  "Chinatown": { lat: 37.7941, lng: -122.4078 },
  "Excelsior": { lat: 37.7244, lng: -122.4283 },
  "Financial District/South Beach": { lat: 37.7920, lng: -122.3970 },
  "Glen Park": { lat: 37.7338, lng: -122.4337 },
  "Golden Gate Park": { lat: 37.7694, lng: -122.4862 },
  "Haight Ashbury": { lat: 37.7702, lng: -122.4467 },
  "Hayes Valley": { lat: 37.7759, lng: -122.4245 },
  "Inner Richmond": { lat: 37.7807, lng: -122.4644 },
  "Inner Sunset": { lat: 37.7626, lng: -122.4682 },
  "Japantown": { lat: 37.7855, lng: -122.4297 },
  "Lakeshore": { lat: 37.7263, lng: -122.4855 },
  "Lincoln Park": { lat: 37.7836, lng: -122.5054 },
  "Lone Mountain/USF": { lat: 37.7794, lng: -122.4467 },
  "Marina": { lat: 37.8035, lng: -122.4376 },
  "McLaren Park": { lat: 37.7185, lng: -122.4181 },
  "Mission": { lat: 37.7599, lng: -122.4148 },
  "Mission Bay": { lat: 37.7708, lng: -122.3893 },
  "Nob Hill": { lat: 37.7929, lng: -122.4156 },
  "Noe Valley": { lat: 37.7503, lng: -122.4339 },
  "North Beach": { lat: 37.8030, lng: -122.4106 },
  "Oceanview/Merced/Ingleside": { lat: 37.7185, lng: -122.4548 },
  "Outer Mission": { lat: 37.7170, lng: -122.4441 },
  "Outer Richmond": { lat: 37.7775, lng: -122.4951 },
  "Pacific Heights": { lat: 37.7925, lng: -122.4382 },
  "Portola": { lat: 37.7283, lng: -122.4054 },
  "Potrero Hill": { lat: 37.7585, lng: -122.4001 },
  "Presidio": { lat: 37.7989, lng: -122.4662 },
  "Presidio Heights": { lat: 37.7884, lng: -122.4513 },
  "Russian Hill": { lat: 37.8014, lng: -122.4193 },
  "Seacliff": { lat: 37.7872, lng: -122.4929 },
  "South of Market": { lat: 37.7785, lng: -122.4056 },
  "Sunset/Parkside": { lat: 37.7506, lng: -122.4842 },
  "Tenderloin": { lat: 37.7838, lng: -122.4144 },
  "Treasure Island": { lat: 37.8246, lng: -122.3702 },
  "Twin Peaks": { lat: 37.7544, lng: -122.4477 },
  "Visitacion Valley": { lat: 37.7159, lng: -122.4051 },
  "West of Twin Peaks": { lat: 37.7355, lng: -122.4583 },
  "Western Addition": { lat: 37.7798, lng: -122.4324 },
};

// Normalize before lookup — SFPD CAD has historically used variations
// like "SOUTH OF MARKET" / "Soma" / "South Of Market". Lowercase + collapse
// whitespace before matching.
const LOOKUP: Map<string, { lat: number; lng: number }> = (() => {
  const m = new Map<string, { lat: number; lng: number }>();
  for (const [name, coord] of Object.entries(SF_NEIGHBORHOOD_CENTROIDS)) {
    m.set(name.toLowerCase(), coord);
  }
  // Common aliases the SFPD CAD feed has been known to emit.
  m.set("soma", SF_NEIGHBORHOOD_CENTROIDS["South of Market"]!);
  m.set("south of market", SF_NEIGHBORHOOD_CENTROIDS["South of Market"]!);
  m.set("fidi", SF_NEIGHBORHOOD_CENTROIDS["Financial District/South Beach"]!);
  m.set("financial district", SF_NEIGHBORHOOD_CENTROIDS["Financial District/South Beach"]!);
  m.set("bayview", SF_NEIGHBORHOOD_CENTROIDS["Bayview Hunters Point"]!);
  m.set("hunters point", SF_NEIGHBORHOOD_CENTROIDS["Bayview Hunters Point"]!);
  return m;
})();

export function lookupNeighborhoodCentroid(
  name: string | null | undefined,
): { lat: number; lng: number } | null {
  if (!name) return null;
  return LOOKUP.get(name.trim().toLowerCase()) ?? null;
}
