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

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: Date;
  uploadedBy: string;
  url: string;
}

/** A division has dealt with a message. For the Nachrichtenkarte division: the message has been drawn. */
export interface MessageAcknowledgement {
  divisionId: string;
  acknowledgedAt: Date;
  acknowledgedBy: string;
}

export interface Message {
  id: string;
  number: number;
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
  attachments: Attachment[];
  /** Divisions that have dealt with the message; cleared when its content or time changes. */
  acknowledgements: MessageAcknowledgement[];
  /** OAuth sub of the operator who recorded this message. Empty string for older messages. */
  author: string;
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

/** STANDARD divisions are user-managed; MESSAGE_MAP is the system-managed Nachrichtenkarte. */
export type DivisionKind = "STANDARD" | "MESSAGE_MAP";

export interface Division {
  id: string;
  name: string;
  description: string;
  kind: DivisionKind;
}
