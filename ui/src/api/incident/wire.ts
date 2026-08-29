// Hasura wire types for the incident aggregate.
// All date fields are ISO strings as returned by Hasura.
// Internal to src/api/incident/ — never import outside src/api/.

export interface WireLocationNoId {
  name: string;
  coordinates: string;
}

export interface WireLocation {
  id: string;
  name: string;
  coordinates: string;
}

export interface WireJournalSummary {
  id: string;
  name: string;
}

export interface WireDivisionSummary {
  id: string;
  name: string;
  description: string;
}

export interface WireLayerSummary {
  id: string;
  name: string;
}

export interface WireIncidentSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  closedAt: string | null;
  location: WireLocationNoId;
}

export interface WireIncidentDetails {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string | null;
  closedAt: string | null;
  location: WireLocation;
  divisions: WireDivisionSummary[];
  journals: WireJournalSummary[];
}

export interface WireGetIncidentsResult {
  incidents: WireIncidentSummary[];
}

export interface WireGetIncidentDetailsResult {
  incidentsByPk: WireIncidentDetails | null;
}

export interface WireInsertIncidentResult {
  insertIncidentsOne: {
    id: string;
    journals: WireJournalSummary[];
    divisions: WireDivisionSummary[];
    layers: WireLayerSummary[];
  };
}

export interface WireUpdateIncidentResult {
  updateLocationsByPk: WireLocation;
  insertDivisions: { affectedRows: number };
  updateIncidentsByPk: {
    id: string;
    name: string;
    journals: WireJournalSummary[];
    divisions: WireDivisionSummary[];
  };
}

export interface WireCloseIncidentResult {
  updateJournals: {
    affectedRows: number;
    returning: { id: string; closedAt: string | null }[];
  } | null;
  updateIncidents: {
    affectedRows: number;
    returning: { id: string; closedAt: string | null }[];
  } | null;
}

export interface WireDeleteIncidentResult {
  updateJournals: {
    affectedRows: number;
    returning: { id: string; deletedAt: string | null }[];
  } | null;
  updateIncidents: {
    affectedRows: number;
    returning: { id: string; deletedAt: string | null }[];
  } | null;
}

export interface GetIncidentDetailsVars {
  incidentId: string;
}

export interface InsertIncidentVars {
  name: string;
  location: string;
  divisions: { name: string; description: string }[];
  journalName: string;
  layerName: string;
}

export interface UpdateIncidentVars {
  incidentId: string;
  name: string;
  location: string;
  locationId: string;
  divisions: { name: string; description: string; incidentId: string }[];
}

export interface CloseIncidentVars {
  incidentId: string;
  closedAt: Date | null;
}

export interface DeleteIncidentVars {
  incidentId: string;
  deletedAt: Date;
}
