import { Division, Journal } from "./journal";

export interface Location {
  name: string;
  id: string;
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
  divisions: Division[];
  journals: Journal[];
};

export interface IncidentListData {
  incidents: Incident[];
}

export interface IncidentDetailsData {
  incidentsByPk: Incident;
}

export interface IncidentDetailsVars {
  incidentId: string;
}

export interface InsertIncidentData {
  insertIncidentsOne: Incident;
}

export interface InsertIncidentVars {
  name: string;
  location: string;
  divisions: DivisionInput[];
  journalName: string;
}

export interface DivisionInput {
  name: string;
  description: string;
}

export interface DivisionUpdate {
  name: string;
  description: string;
  incidentId: string;
}

export interface UpdateIncidentData {
  updateLocationsByPk: Location;
  insertDivisions: {
    affectedRows: Number;
  };
  updateIncidentsByPk: Incident;
}

export interface UpdateIncidentVars {
  name: string;
  incidentId: string;
  location: string;
  locationId: string;
  divisions: DivisionUpdate[];
}
