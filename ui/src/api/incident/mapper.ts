import type { Division, Incident, Journal, Location } from "types";
import { toDate, toOptionalDate } from "../common/mapper";
import type { WireIncidentDetails, WireIncidentSummary, WireLocation, WireLocationNoId } from "./wire";

function toLocationNoId(w: WireLocationNoId): Location {
  return { id: "", name: w.name, coordinates: w.coordinates };
}

function toLocation(w: WireLocation): Location {
  return { id: w.id, name: w.name, coordinates: w.coordinates };
}

export function toIncidentSummary(w: WireIncidentSummary): Incident {
  return {
    id: w.id,
    name: w.name,
    createdAt: toDate(w.createdAt),
    updatedAt: toOptionalDate(w.updatedAt),
    deletedAt: toOptionalDate(w.deletedAt),
    closedAt: toOptionalDate(w.closedAt),
    location: toLocationNoId(w.location),
    divisions: [],
    journals: [],
    layers: [],
  };
}

export function toIncidentDetails(w: WireIncidentDetails): Incident {
  return {
    id: w.id,
    name: w.name,
    createdAt: toDate(w.createdAt),
    updatedAt: toOptionalDate(w.updatedAt),
    deletedAt: null,
    closedAt: toOptionalDate(w.closedAt),
    location: toLocation(w.location),
    divisions: w.divisions.map(
      (d): Division => ({ id: d.id, name: d.name, description: d.description }),
    ),
    // GET_INCIDENT_DETAILS only fetches id+name for journals; the Journal type has
    // more required date fields that are unused in this context (navigation only).
    journals: w.journals.map((j) => ({ id: j.id, name: j.name } as Journal)),
    layers: [],
  };
}
