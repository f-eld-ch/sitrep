import { Incident } from "./incident";

export enum TriageStatus {
  Pending = "PENDING",
  Triaged = "DONE",
  Reset = "RESET",
  MoreInfo = "MOREINFO",
}

export enum PriorityStatus {
  Normal = "NORMAL",
  High = "HIGH",
}

export enum Medium {
  Radio = "RADIO",
  Phone = "PHONE",
  Email = "EMAIL",
  Other = "OTHER",
}

export type Message = {
  id: string;
  content: string;
  sender: string;
  senderDetail: string;
  receiver: string;
  receiverDetail: string;
  time: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  divisions: DivisionList[];
  mediumId: Medium;
  triageId: TriageStatus;
  priorityId: PriorityStatus;
};

export type Triage = {
  name: TriageStatus;
  description: string;
};

export type Priority = {
  name: PriorityStatus;
  description: string;
};

export interface DivisionList {
  division: Division;
}

export interface Division {
  id: string;
  name: string;
  description: string;
}

export interface MessageListData {
  journalsByPk: Journal;
  messages: Message[];
}

export interface MessageListVars {
  journalId: string;
}

export type Journal = {
  id: string;
  name: string;
  incident: Incident;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date;
  deletedAt: Date;
};

export interface JournalListData {
  incidents: Incident[]
  id: string;
  name: string;
  journals: Journal[];
}

export interface JournalListVars {
  incidentId: string;
}

interface TriageMessage extends Message {
  journal: {
    incident: {
      divisions: Division[];
    };
  };
}

export interface TriageMessageData {
  messagesByPk: TriageMessage
}

export interface TriageMessageVars {
  messageId: string | undefined;
}

export interface MessageDivision {
  messageId: string;
  divisionId: string;
}

export interface SaveMessageTriageVars {
  messageId: string;
  messageDivisions: MessageDivision[];
  priority: PriorityStatus;
  triage: TriageStatus;
}

export interface SaveMessageTriageData {
  delete_message_division: {
    affected_rows: number;
  };
  insertMessageDivision: {
    affected_rows: number;
  };
  updateMessagesByPk: Message;
}


export interface InsertJournalData {
  insertJournalsOne: Journal
}


export interface InsertJournalVars {
  name: string;
  incidentId: string;
}