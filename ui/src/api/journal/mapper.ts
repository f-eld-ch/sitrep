import type { Incident, Journal } from "types";
import { toDate, toOptionalDate } from "../common/mapper";
import type { GetJournalsQuery } from "gql";

type WireJournal = GetJournalsQuery["incidents"][0]["journals"][0];

export function toJournal(w: WireJournal): Journal {
  return {
    id: w.id,
    name: w.name,
    // GET_JOURNALS does not fetch the parent incident; only id+name are accessed in views.
    incident: {} as Incident,
    createdAt: toDate(w.createdAt),
    updatedAt: toDate(w.updatedAt),
    // The domain Journal type declares Date (not Date|null) but closedAt/deletedAt are
    // genuinely nullable. Cast preserves correct null behaviour until the type is fixed.
    closedAt: toOptionalDate(w.closedAt) as Date,
    deletedAt: toOptionalDate(w.deletedAt) as Date,
  };
}
