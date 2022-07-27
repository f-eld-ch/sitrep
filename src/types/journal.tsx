export enum TriageStatus {
  Pending = "pending",
  Triaged = "done",
  Reset = "reset",
  MoreInfo = "more-info",
}

export enum PriorityStatus {
  Normal = "normal",
  High = "high",
}

export type Message = {
  id: string;
  content: string;
  sender: string;
  receiver: string;
  time: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  divisions: DivisionList[];
  triage: Triage;
  priority: Priority;
};

export type Triage = {
  name: string;
  description: string;
};

export type Priority = {
  name: string;
  description: string;
};

export interface DivisionList {
  division: Division;
}

export interface Division {
  name: string;
  description: string;
}

export interface MessageListData {
  messages: Message[];
}

export interface MessageListVars {
  journalId: string;
}

export type Journal = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date;
  deletedAt: Date;
};

export interface JournalListData {
  journals: Journal[];
}

export interface JournalListVars {
  incidentId: string;
}
