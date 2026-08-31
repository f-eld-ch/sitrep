import type { Division, Incident, Location } from "types";
import { toDate, toOptionalDate } from "../common/mapper";
import type { FetchIncidentsQuery, GetIncidentDetailQuery } from "gql/next";

type WireIncidentSummary = FetchIncidentsQuery["incidents"][0];
type WireIncidentDetail = NonNullable<GetIncidentDetailQuery["incident"]>;

function toLocation(
  w: WireIncidentSummary["location"] | WireIncidentDetail["location"],
): Location {
  if (!w) return { id: "", name: "", coordinates: "" };
  return {
    id: "",
    name: w.name,
    coordinates: w.coordinates ? JSON.stringify(w.coordinates) : "",
  };
}

export function toIncidentSummary(w: WireIncidentSummary): Incident {
  return {
    id: w.id,
    name: w.name,
    createdAt: toDate(w.createdAt),
    updatedAt: toOptionalDate(w.updatedAt),
    deletedAt: null,
    closedAt: toOptionalDate(w.closedAt),
    location: toLocation(w.location),
    divisions: [],
    journals: [],
    layers: [],
  };
}

export function toIncidentDetails(w: WireIncidentDetail): Incident {
  return {
    id: w.id,
    name: w.name,
    createdAt: toDate(w.createdAt),
    updatedAt: toOptionalDate(w.updatedAt),
    deletedAt: null,
    closedAt: toOptionalDate(w.closedAt),
    location: toLocation(w.location),
    divisions: w.divisions.map((d): Division => ({
      id: d.id,
      name: d.name,
      description: d.description,
    })),
    journals: [],
    layers: [],
  };
}
