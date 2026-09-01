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

const IncidentContextSetter = () => {
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
    } else if (result.status === "error") {
      dispatch({ type: "SET_INCIDENT", payload: null, forId: incidentId });
    }
  }, [incidentId, result.status, result.data, state.incident, dispatch]);

  return null;
};

export { IncidentContext, IncidentContextProvider, IncidentContextSetter };
