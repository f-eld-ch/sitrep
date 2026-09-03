import type { GeoJsonProperties, Geometry } from "geojson";
import type { Incident } from "./incident";

export interface Layer {
  id: string;
  sourceIncidentId: string;
  sourceIncidentName: string;
  name: string;
  incident: Incident;
  features: Feature[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
}

export interface Feature {
  id: string;
  geometry: Geometry;
  properties: GeoJsonProperties;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
}
