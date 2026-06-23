import type { Incident } from "./incident";
import type { Journal } from "./journal";
export interface UserState {
  isLoggedin: boolean;
  isLoggedIn?: boolean;
  username: string;
  email: string;
}

export interface IncidentContext {
  incident: Incident | null;
  journal: Journal | null;
}
