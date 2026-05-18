// Supercluster wrapper: builds a clustered point index and provides the
// helpers sf-map.tsx needs to render at low zoom (clusters) and high zoom
// (individual pins). Heatmap mode bypasses clustering — MapLibre's native
// heatmap layer reads the raw FeatureCollection directly.
//
// Why a thin wrapper: lets sf-map.tsx stay unaware of supercluster's API
// shape; future swap to deck.gl/h3 stays local to this file.

import Supercluster from "supercluster";
import type { Feature, FeatureCollection, Point } from "geojson";

export interface ClusterableProps {
  /** Stable id for the point (incident, news, camera). */
  id: string;
  /** Coarse "kind" the renderer uses for color/icon. */
  kind: string;
  /** Optional severity bucket for downstream color scales. */
  severity?: string | null;
  /** Optional ISO timestamp for time-window filters. */
  occurredAt?: string | null;
}

export type Pt = Feature<Point, ClusterableProps>;

/** Convert a flat array of [lng, lat, props] into a GeoJSON FeatureCollection. */
export function toFeatureCollection(
  points: Array<{ lng: number; lat: number; props: ClusterableProps }>,
): FeatureCollection<Point, ClusterableProps> {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: p.props,
    })),
  };
}

export interface ClusterIndex {
  /** Get clusters/leaves visible inside a bbox at a given integer zoom. */
  getClusters: (
    bbox: [number, number, number, number],
    zoom: number,
  ) => Array<
    Feature<
      Point,
      ClusterableProps & {
        cluster?: boolean;
        cluster_id?: number;
        point_count?: number;
      }
    >
  >;
  /** Expand a cluster's leaves (used when user clicks a cluster bubble). */
  getLeaves: (clusterId: number, limit?: number, offset?: number) => Pt[];
}

export function buildClusterIndex(
  fc: FeatureCollection<Point, ClusterableProps>,
  opts: { radius?: number; maxZoom?: number } = {},
): ClusterIndex {
  const supercluster = new Supercluster<ClusterableProps>({
    radius: opts.radius ?? 50,
    maxZoom: opts.maxZoom ?? 13, // cluster up to 13; >=13 show individual pins
  });
  supercluster.load(fc.features as Pt[]);

  return {
    getClusters: (bbox, zoom) =>
      supercluster.getClusters(bbox, Math.floor(zoom)) as ReturnType<
        ClusterIndex["getClusters"]
      >,
    getLeaves: (id, limit = 10, offset = 0) =>
      supercluster.getLeaves(id, limit, offset) as Pt[],
  };
}

/** Whether a viewport zoom is in "show individual pins" mode. */
export const PIN_ZOOM_THRESHOLD = 13;
export function isPinZoom(zoom: number): boolean {
  return zoom >= PIN_ZOOM_THRESHOLD;
}
