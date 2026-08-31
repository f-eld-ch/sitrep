import { Medium, PriorityStatus, TriageStatus, type Message } from "types";
import type { Division } from "types";
import { toDate, toEnum } from "../common/mapper";
import type { GetIncidentMessagesQuery } from "gql/next";

type WireMessage = NonNullable<GetIncidentMessagesQuery["incident"]>["messages"][0];

const ALL_MEDIA = Object.values(Medium) as string[];
const ALL_TRIAGE = Object.values(TriageStatus) as string[];
const ALL_PRIORITY = Object.values(PriorityStatus) as string[];

export function toDivision(w: { id: string; name: string; description: string }): Division {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
  };
}

export function toMessage(w: WireMessage): Message {
  return {
    id: w.id,
    number: w.number,
    content: w.content,
    sender: w.sender,
    senderDetail: w.senderDetail,
    receiver: w.receiver,
    receiverDetail: w.receiverDetail,
    medium: toEnum(ALL_MEDIA, w.medium, Medium.Radio) as Medium,
    time: toDate(w.time),
    createdAt: toDate(w.createdAt),
    updatedAt: toDate(w.updatedAt),
    // deletedAt is not in the new schema; server hides deleted messages
    deletedAt: new Date(0),
    // Flat divisions from new schema wrapped into the DivisionList shape the UI expects
    divisions: w.divisions.map((d) => ({ division: toDivision(d) })),
    triageId: toEnum(ALL_TRIAGE, w.triage, TriageStatus.Pending) as TriageStatus,
    priorityId: toEnum(ALL_PRIORITY, w.priority, PriorityStatus.Normal) as PriorityStatus,
  };
}
