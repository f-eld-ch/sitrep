import { Journal } from "./journal";

export interface Location {
  name: string;
  coordinates: string;
}

export type Incident = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  closedAt: Date;
  location: Location;
  journals: Journal[];
};

export interface IncidentListData {
  incidents: Incident[];
}

export interface IncidentDetailsData {
  incidents_by_pk: Incident;
}

export interface IncidentDetailsVars {
  incidentId: string;
}
