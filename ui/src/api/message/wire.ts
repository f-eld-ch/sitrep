/**
 * Hasura wire types for the message aggregate.
 *
 * These types reflect what Hasura actually returns on the wire — NOT what
 * the TypeScript types in src/types/journal.ts claim. Key differences:
 * - Date fields are ISO 8601 strings, not Date objects.
 * - deletedAt is nullable (the non-nullable lie in the domain type masks real nulls).
 * - Enums are plain strings; coercion with fallback happens in the mapper.
 * - divisions uses the message_division join-table shape.
 */

export interface WireDivision {
  id: string;
  name: string;
  description: string;
}

export interface WireDivisionList {
  division: WireDivision;
}

export interface WireMessage {
  id: string;
  content: string;
  sender: string;
  receiver: string;
  senderDetail: string;
  receiverDetail: string;
  medium: string;
  time: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  divisions: WireDivisionList[];
  triageId: string;
  priorityId: string;
}

export interface WireGetMessagesResult {
  journalsByPk: {
    incident: {
      id: string;
      divisions: WireDivision[] | null;
    } | null;
  } | null;
  messages: WireMessage[];
}

export interface WireTriageMessage extends WireMessage {
  journal: {
    incident: {
      divisions: WireDivision[];
    };
  };
}

export interface WireGetMessageForTriageResult {
  messagesByPk: WireTriageMessage | null;
}

export interface WireInsertMessageResult {
  insertMessagesOne: WireMessage;
}

export interface WireUpdateMessageResult {
  updateMessagesByPk: WireMessage;
}

export interface WireSaveMessageTriageResult {
  delete_message_division: { affectedRows: number } | null;
  insertMessageDivision: { affectedRows: number };
  updateMessagesByPk: Pick<WireMessage, "id" | "triageId" | "priorityId" | "divisions">;
}
