import { Medium, PriorityStatus, TriageStatus, type Message } from "types";
import type { Division } from "types";
import { toDate, toEnum, toOptionalDate } from "../common/mapper";
import type { WireDivision, WireMessage } from "./wire";

const ALL_MEDIA = Object.values(Medium) as string[];
const ALL_TRIAGE = Object.values(TriageStatus) as string[];
const ALL_PRIORITY = Object.values(PriorityStatus) as string[];

export function toDivision(w: WireDivision): Division {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
  };
}

export function toMessage(w: WireMessage): Message {
  return {
    id: w.id,
    number: undefined,
    content: w.content,
    sender: w.sender,
    senderDetail: w.senderDetail,
    receiver: w.receiver,
    receiverDetail: w.receiverDetail,
    medium: toEnum(ALL_MEDIA, w.medium, Medium.Radio) as Medium,
    time: toDate(w.time),
    createdAt: toDate(w.createdAt),
    updatedAt: toDate(w.updatedAt),
    deletedAt: toOptionalDate(w.deletedAt) ?? new Date(0),
    divisions: w.divisions.map((d) => ({ division: toDivision(d.division) })),
    triageId: toEnum(ALL_TRIAGE, w.triageId, TriageStatus.Pending) as TriageStatus,
    priorityId: toEnum(ALL_PRIORITY, w.priorityId, PriorityStatus.Normal) as PriorityStatus,
  };
}
