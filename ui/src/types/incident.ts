import type { Division, Journal } from "./journal";
import type { Layer } from "./layer";

export interface Location {
  name: string;
  id: string;
  coordinates: string;
}

export interface Incident {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
  closedAt: Date | null;
  location: Location;
  divisions: Division[];
  journals: Journal[];
  layers: Layer[];
}
