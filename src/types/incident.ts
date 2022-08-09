import { Division, Journal } from "./journal";

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
  divisions: Division[];
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


export interface InsertIncidentData {
    insert_incidents_one: Incident
}

export interface InsertIncidentVars {
  name: string
  location: string
  divisions: DivisionInput[]
  journalName: string
}

export interface DivisionInput {
  name: string,
  description: string,
}