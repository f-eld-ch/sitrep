import type { Division, Journal } from "./journal";
import type { Layer } from "./layer";

export interface Location {
  name: string;
  id: string;
  coordinates: string;
}

export interface Incident {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
  closedAt: Date | null;
  location: Location;
  divisions: Division[];
  journals: Journal[];
  layers: Layer[];
}

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
  layerName: string;
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
    affectedRows: number;
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

export type CloseIncidentMutation = {
  updateIncidents: {
    affectedRows: number;
    returning: { id: string; closedAt: Date | null }[];
  } | null;
};
export type CloseIncidentMutationVariables = {
  incidentId?: string;
  closedAt?: Date | null;
};

export type DeleteIncidentMutation = {
  updateIncidents: {
    affectedRows: number;
    returning: { id: string; deletedAt: Date | null }[];
  } | null;
};
export type DeleteIncidentMutationVariables = {
  incidentId?: string;
  deletedAt?: Date | null;
};
