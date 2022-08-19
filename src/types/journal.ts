import { Incident } from "./incident";

export enum TriageStatus {
  Pending = "pending",
  Triaged = "done",
  Reset = "reset",
  MoreInfo = "moreinfo",
}

export enum PriorityStatus {
  Normal = "normal",
  High = "high",
}


export enum Medium {
  Radio = "Radio",
  Phone = "Phone",
  Email = "Email",
}

export type Message = {
  id: string;
  content: string;
  sender: string;
  senderDetail?: string;
  receiver: string;
  receiverDetail?: string;
  time: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  divisions: DivisionList[];
  mediaType: Medium;
  channel?: string;
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
  id: string;
  name: string;
  description: string;
}

export interface MessageListData {
  journals_by_pk: Journal;
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
  messages_by_pk: TriageMessage
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
  insert_message_division: {
    affected_rows: number;
  };
  update_messages_by_pk: Message;
}


export interface InsertJournalData {
  insert_journals_one: Journal
}


export interface InsertJournalVars {
  name: string;
  incidentId: string;
}