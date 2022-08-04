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
  id: string;
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

export interface TriageMessageData {
  messages_by_pk: {
    id: string;

    content: string;
    sender: string;
    receiver: string;
    divisions: DivisionList[];
    time: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date;
    triage: Triage;
    priority: Priority;
    journal: {
      incident: {
        divisions: Division[];
      };
    };
  };
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
