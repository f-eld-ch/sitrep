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
};

type IncidentAction = { type: "SET_INCIDENT"; payload: Incident | null };

const incidentReducer = (
  state: IncidentContextState,
  action: IncidentAction,
): IncidentContextState => {
  switch (action.type) {
    case "SET_INCIDENT":
      return { ...state, incident: action.payload };
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
      if (state.incident !== null) {
        dispatch({ type: "SET_INCIDENT", payload: null });
      }
      return;
    }

    if (result.status !== "ready") return;

    const { incident } = result.data;
    if (state.incident?.id !== incident.id) {
      dispatch({ type: "SET_INCIDENT", payload: incident });
    }
  }, [incidentId, result.status, result.data, state.incident, dispatch]);

  return null;
};

export { IncidentContext, IncidentContextProvider, IncidentContextSetter };
