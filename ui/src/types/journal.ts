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

export interface Message {
  id: string;
  number?: number;
  content: string;
  sender: string;
  senderDetail: string;
  receiver: string;
  receiverDetail: string;
  time: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  divisions: DivisionList[];
  medium: Medium;
  triageId: TriageStatus;
  priorityId: PriorityStatus;
}

export interface Triage {
  name: TriageStatus;
  description: string;
}

export interface Priority {
  name: PriorityStatus;
  description: string;
}

export interface DivisionList {
  division: Division;
}

export interface Division {
  id: string;
  name: string;
  description: string;
}

