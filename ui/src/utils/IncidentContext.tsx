import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
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
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <IncidentContext.Provider value={value}>{children}</IncidentContext.Provider>;
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

  const currentIncidentId = state.incident?.id ?? null;
  const resultIncident = result.status === "ready" ? result.data.incident : null;
  const resultErrorCode = result.status === "error" ? result.error.code : null;

  useEffect(() => {
    if (!incidentId) {
      dispatch({ type: "SET_INCIDENT", payload: null, forId: null });
      return;
    }

    if (resultIncident) {
      if (currentIncidentId !== resultIncident.id) {
        dispatch({ type: "SET_INCIDENT", payload: resultIncident, forId: incidentId });
      }
    } else if (resultErrorCode !== null && currentIncidentId !== incidentId) {
      // Any error loading a *new* incident marks it as absent so pages can surface an error.
      // For the already-loaded incident we retain current state on transient failures.
      dispatch({ type: "SET_INCIDENT", payload: null, forId: incidentId });
    }
  }, [incidentId, resultIncident, resultErrorCode, currentIncidentId, dispatch]);
}

/** @deprecated Use useIncidentSync() directly in the layout component instead. */
const IncidentContextSetter = () => {
  useIncidentSync();
  return null;
};

export { IncidentContext, IncidentContextProvider, IncidentContextSetter };
