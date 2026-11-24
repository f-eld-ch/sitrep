import type { Incident } from "./incident";
export interface UserState {
  isLoggedin: boolean;
  username: string;
  /** The full name, when the identity provider gives one. */
  name?: string;
  email: string;
  sub: string;
}

export interface IncidentContext {
  incident: Incident | null;
  loadedForId: string | null;
}
