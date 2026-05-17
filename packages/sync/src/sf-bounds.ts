// SF City/County bounding box. Tighter than D4 — used by sync sources
// that pull Bay-Area-wide data (e.g., 511 Traffic Events) so we only
// store SF-relevant rows.
//
// The east edge sits just past Treasure Island; the west reaches the
// Pacific; south covers Daly City border; north includes the Presidio
// and the GG Bridge approach.
export const SF_BBOX = {
  minLat: 37.7079,
  maxLat: 37.8324,
  minLng: -122.5247,
  maxLng: -122.3554,
} as const;

export function isInsideSF(lat: number, lng: number): boolean {
  return (
    lat >= SF_BBOX.minLat &&
    lat <= SF_BBOX.maxLat &&
    lng >= SF_BBOX.minLng &&
    lng <= SF_BBOX.maxLng
  );
}

// SF City Hall — useful default center for radius queries.
export const SF_CITY_HALL = { lat: 37.779, lng: -122.4194 } as const;
