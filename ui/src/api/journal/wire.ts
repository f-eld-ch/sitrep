// Hasura wire types for the journal aggregate.
// All date fields are ISO strings. Internal to src/api/journal/.

export interface WireJournal {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  deletedAt: string | null;
}

export interface WireGetJournalsResult {
  incidents: {
    id: string;
    name: string;
    journals: WireJournal[];
  }[];
}

export interface WireInsertJournalResult {
  insertJournalsOne: WireJournal;
}

export interface WireCloseJournalResult {
  updateJournals: {
    affectedRows: number;
    returning: { id: string; closedAt: string | null }[];
  } | null;
}

export interface GetJournalsVars {
  incidentId: string;
}

export interface InsertJournalVars {
  name: string;
  incidentId: string;
}

export interface CloseJournalVars {
  journalId: string;
  closedAt: Date | null;
}
