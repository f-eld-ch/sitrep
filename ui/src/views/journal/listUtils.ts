import type { Message } from "types";

export function stableOrderByCreatedAt<T extends { createdAt: Date; id?: string }>(
  a: T,
  b: T,
): number {
  const tA = new Date(a.createdAt);
  const tB = new Date(b.createdAt);
  if (tA.getTime() !== tB.getTime()) return tA.getTime() - tB.getTime();
  if (a.id && b.id) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return 0;
}

export interface MessageFilters {
  triage: string;
  priority: string;
  assignment: string;
}

export function buildMessageList(messages: Message[], filters: MessageFilters): Message[] {
  return messages
    .filter((m) => m.createdAt !== null)
    .sort(stableOrderByCreatedAt)
    .map((m, i) => ({ ...m, number: i + 1 }))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .filter((m) => filters.triage === "all" || m.triageId === filters.triage)
    .filter((m) => filters.priority === "all" || m.priorityId === filters.priority)
    .filter(
      (m) =>
        filters.assignment === "all" ||
        m.divisions?.find((d) => d.division.name === filters.assignment),
    );
}
