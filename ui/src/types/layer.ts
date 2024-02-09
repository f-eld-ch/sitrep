import { GeoJsonProperties, Geometry } from "geojson";
import { Incident } from "./incident";

export type Layer = {
  id: string;
  name: string;
  incident: Incident;
  features: Features[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
};

export type Features = {
  id: string;
  name: string;
  layer: Layer;
  geometry: Geometry;
  properties: GeoJsonProperties;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
};
