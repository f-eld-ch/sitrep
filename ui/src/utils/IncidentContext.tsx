import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
} from "react";
import { useParams } from "react-router";
import type { Incident, IncidentContext as IncidentContextState } from "types";
import { useIncidentDetails } from "api";

const initialState: IncidentContextState = {
  incident: null,
  loadedForId: null,
};

type IncidentAction = { type: "SET_INCIDENT"; payload: Incident | null; forId: string | null };

const incidentReducer = (
  state: IncidentContextState,
  action: IncidentAction,
): IncidentContextState => {
  switch (action.type) {
    case "SET_INCIDENT":
      return { incident: action.payload, loadedForId: action.forId };
    default:
      return state;
  }
};

const IncidentContext = createContext<{
  state: IncidentContextState;
  dispatch: Dispatch<IncidentAction>;
}>({
  state: initialState,
  dispatch: () => null,
});

const IncidentContextProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(incidentReducer, initialState);
  return (
    <IncidentContext.Provider value={{ state, dispatch }}>{children}</IncidentContext.Provider>
  );
};

/**
 * Syncs the active incident from the Apollo query into IncidentContext.
 * Call this once per layout that has an :incidentId URL param.
 * Lives here (not in a null-render component) so it reads like a plain hook call.
 *
 * useEffect is intentional: we are bridging an async Apollo query into a shared
 * context whose Provider sits outside the Router (above RouterProvider in App.tsx).
 * This is the correct React pattern for syncing external data into context.
 */
export function useIncidentSync() {
  const { incidentId } = useParams();
  const { state, dispatch } = useContext(IncidentContext);
  const result = useIncidentDetails(incidentId);

  useEffect(() => {
    if (!incidentId) {
      dispatch({ type: "SET_INCIDENT", payload: null, forId: null });
      return;
    }

    if (result.status === "ready") {
      const { incident } = result.data;
      if (state.incident?.id !== incident.id) {
        dispatch({ type: "SET_INCIDENT", payload: incident, forId: incidentId });
      }
    } else if (result.status === "error" && result.error.code === "NOT_FOUND") {
      // Only clear on definitive absence — transient failures retain current state.
      dispatch({ type: "SET_INCIDENT", payload: null, forId: incidentId });
    }
  }, [incidentId, result.status, result.data, result.error, state.incident, dispatch]);
}

/** @deprecated Use useIncidentSync() directly in the layout component instead. */
const IncidentContextSetter = () => {
  useIncidentSync();
  return null;
};

export { IncidentContext, IncidentContextProvider, IncidentContextSetter };
