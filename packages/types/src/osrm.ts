export interface OSRMGeometry {
  coordinates: [number, number][]; // [lon, lat]
  type: string; // "LineString"
}

export interface OSRMAnnotation {
  distance: number[];
  duration: number[];
  nodes: number[];
}

export interface OSRMLeg {
  steps: any[]; // We generally don't need turn-by-turn steps for just snapping
  distance: number;
  duration: number;
  summary: string;
  weight: number;
  annotation?: OSRMAnnotation;
}

export interface OSRMWaypoint {
  hint: string;
  distance: number;
  name: string;
  location: [number, number]; // [lon, lat]
  matchings_index: number;
  waypoint_index: number;
  alternatives_count: number;
}

export interface OSRMMatch {
  confidence: number;
  geometry: OSRMGeometry | string; // GeoJSON or Polyline string depending on request
  legs: OSRMLeg[];
  distance: number;
  duration: number;
  weight: number;
}

export interface OSRMMatchResponse {
  code: string; // "Ok" or error code
  matchings: OSRMMatch[];
  tracepoints: (OSRMWaypoint | null)[];
}
