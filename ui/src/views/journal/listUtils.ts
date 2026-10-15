import { TriageStatus } from "types";
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
  /** "all" shows all authors; "me" filters to the current user (compare against userSub); any other value is a literal sub match */
  author: string;
  /**
   * Only messages that need attention from (state "pending") or were dealt with by (state "done")
   * the given division. Messages not triaged to the division never match. Omit for no filtering.
   */
  acknowledgement?: { divisionId: string; state: "pending" | "done" };
  /** Only messages triaged to the division with this id (more robust than the name-based `assignment`). */
  divisionId?: string;
}

export function buildMessageList(
  messages: Message[],
  filters: MessageFilters,
  /** Current user's OAuth sub — required when filters.author !== "all" */
  userSub?: string,
): Message[] {
  return messages
    .filter((m) => m.createdAt !== null)
    .sort(stableOrderByCreatedAt)
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .filter((m) => {
      if (filters.triage === "all") return true;
      if (filters.triage === "untriaged")
        return m.triageId === TriageStatus.Pending || m.triageId === TriageStatus.Reset;
      if (filters.triage === "triaged_only")
        return m.triageId !== TriageStatus.Pending && m.triageId !== TriageStatus.Reset;
      return m.triageId === filters.triage;
    })
    .filter((m) => filters.priority === "all" || m.priorityId === filters.priority)
    .filter(
      (m) =>
        filters.assignment === "all" ||
        m.divisions?.find((d) => d.division.name === filters.assignment),
    )
    .filter(
      (m) => !filters.divisionId || m.divisions?.some((d) => d.division.id === filters.divisionId),
    )
    .filter((m) => {
      const ack = filters.acknowledgement;
      if (!ack) return true;
      if (!m.divisions?.some((d) => d.division.id === ack.divisionId)) return false;
      const done = m.acknowledgements.some((a) => a.divisionId === ack.divisionId);
      return ack.state === "done" ? done : !done;
    })
    .filter((m) => {
      if (filters.author === "all") return true;
      const sub = filters.author === "me" ? (userSub ?? "") : filters.author;
      return sub !== "" && m.author === sub;
    });
}
