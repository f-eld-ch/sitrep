import { GeoJsonProperties, Geometry } from "geojson";
import { Incident } from "./incident";

export type Layer = {
  id: string;
  name: string;
  incident: Incident;
  features: Feature[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
};

export type Feature = {
  id: string | number | undefined;
  geometry: Geometry;
  properties: GeoJsonProperties;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
};


export interface GetLayersData {
  layers: Layer[];
}

export interface GetLayersVars {
  incidentId: string;
}


export interface AddFeatureVars {
  layerId: string;
  geometry: Geometry;
  properties: GeoJsonProperties;
  id: string | number | undefined;
}

export interface ModifyFeatureVars {
  id: string | number | undefined;
  geometry: Geometry;
  properties: GeoJsonProperties;
}

export interface DeleteFeatureVars {
  id: string | number | undefined;
  deletedAt: Date;
}