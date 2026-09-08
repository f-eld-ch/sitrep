import type { Division } from "./journal";
import type { Layer } from "./layer";

export interface Location {
  name: string;
  id: string;
  coordinates: string;
}

export interface Incident {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
  closedAt: Date | null;
  canWrite: boolean;
  canManage: boolean;
  canDelete: boolean;
  canManageAccess: boolean;
  accessMode: "OPEN_OPERATIONAL" | "RESTRICTED";
  location: Location;
  divisions: Division[];
  childIncidents: Incident[];
  layers: Layer[];
}
