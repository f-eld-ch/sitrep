import { toEnum } from "../common/mapper";
import type { GetIncidentResourcesQuery } from "./documents";

// ── Domain enums ──────────────────────────────────────────────────────────────
// Defined here, independent of the generated wire types, so views never import
// from gql/next/graphql directly.

export type ResourceFormation = "FW" | "POL" | "ARMEE" | "ZS" | "TECHNB" | "SAN" | "OTHER";
export type ResourceUnitSize = "TRUPP" | "GRUPPE" | "ZUG" | "KOMPANIE" | "BATAILLON";
export type ResourceStatus = "AUFGEBOTEN" | "EINSATZBEREIT" | "EINGESETZT" | "ABGELOEST";
export type ContactMedium = "PHONE" | "RADIO" | "OTHER";

const FORMATIONS: readonly ResourceFormation[] = ["FW", "POL", "ARMEE", "ZS", "TECHNB", "SAN", "OTHER"];
const SIZES: readonly ResourceUnitSize[] = ["TRUPP", "GRUPPE", "ZUG", "KOMPANIE", "BATAILLON"];
const STATUSES: readonly ResourceStatus[] = ["AUFGEBOTEN", "EINSATZBEREIT", "EINGESETZT", "ABGELOEST"];
const MEDIUMS: readonly ContactMedium[] = ["PHONE", "RADIO", "OTHER"];

export function toResourceFormation(raw: string): ResourceFormation {
  return toEnum(FORMATIONS, raw, "OTHER");
}

export function toResourceUnitSize(raw: string): ResourceUnitSize {
  return toEnum(SIZES, raw, "GRUPPE");
}

export function toResourceStatus(raw: string): ResourceStatus {
  return toEnum(STATUSES, raw, "AUFGEBOTEN");
}

export function toContactMedium(raw: string): ContactMedium {
  return toEnum(MEDIUMS, raw, "OTHER");
}

// ── Wire → domain ─────────────────────────────────────────────────────────────

type WireResource = NonNullable<
  GetIncidentResourcesQuery["incident"]
>["schadenplaetze"][0]["resources"][0];

export interface ResourceContact {
  medium: ContactMedium;
  detail: string;
}

export interface ResourceHomeLocation {
  name: string;
  lat: number | null;
  lng: number | null;
}

export interface ResourceDeploymentLocation {
  lat: number;
  lng: number;
  label: string;
}

export interface Resource {
  id: string;
  incidentId: string;
  schadenplatzId: string;
  formation: ResourceFormation;
  name: string;
  size: ResourceUnitSize;
  personnelCount: number;
  hauptaufgabe: string;
  contact: ResourceContact | null;
  homeLocation: ResourceHomeLocation | null;
  deploymentLocation: ResourceDeploymentLocation | null;
  status: ResourceStatus;
  statusAt: string;
  einsatzBeginn: string | null;
  einsatzEnde: string | null;
  predecessorId: string | null;
  successorId: string | null;
  sourceMessageId: string | null;
}

export function toResource(w: WireResource): Resource {
  return {
    id: w.id,
    incidentId: w.incidentId,
    schadenplatzId: w.schadenplatzId,
    formation: toResourceFormation(w.formation),
    name: w.name,
    size: toResourceUnitSize(w.size),
    personnelCount: w.personnelCount,
    hauptaufgabe: w.hauptaufgabe,
    contact: w.contact
      ? { medium: toContactMedium(w.contact.medium), detail: w.contact.detail }
      : null,
    homeLocation: w.homeLocation ?? null,
    deploymentLocation: w.deploymentLocation ?? null,
    status: toResourceStatus(w.status),
    statusAt: w.statusAt,
    einsatzBeginn: w.einsatzBeginn,
    einsatzEnde: w.einsatzEnde,
    predecessorId: w.predecessorId,
    successorId: w.successorId,
    sourceMessageId: w.sourceMessageId,
  };
}
