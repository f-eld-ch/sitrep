import type { GeoJsonProperties, Geometry } from "geojson";
import type { Incident } from "./incident";

export interface Layer {
  id: string;
  sourceIncidentId: string;
  sourceIncidentName: string;
  name: string;
  /** MESSAGE_MAP is the system-managed Nachrichtenkarte layer. */
  kind: "STANDARD" | "MESSAGE_MAP";
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

/** A message a feature was drawn for; just what the feature popup shows. */
export interface FeatureMessage {
  id: string;
  number: number;
  sender: string;
  receiver: string;
  content: string;
  time: Date;
}
