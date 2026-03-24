import { useQuery } from "@apollo/client/react";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
} from "react";
import { useParams } from "react-router";

import type { Incident, IncidentContext as IncidentContextState, Journal } from "types";
import type { IncidentDetailsData, IncidentDetailsVars } from "types/incident";
import { GetIncidentDetails } from "views/incident/graphql";

// Define the initial state
const initialState: IncidentContextState = {
  incident: null,
  journal: null,
};

// Define action types
type IncidentAction =
  | { type: "SET_INCIDENT"; payload: Incident | null }
  | { type: "SET_JOURNAL"; payload: Journal | null };

// Define the reducer function
const incidentReducer = (
  state: IncidentContextState,
  action: IncidentAction,
): IncidentContextState => {
  switch (action.type) {
    case "SET_INCIDENT":
      return {
        ...state,
        incident: action.payload,
      };
    case "SET_JOURNAL":
      return {
        ...state,
        journal: action.payload,
      };
    default:
      return state;
  }
};

// Create the IncidentContext with initial state and a dummy dispatch function
const IncidentContext = createContext<{
  state: IncidentContextState;
  dispatch: Dispatch<IncidentAction>;
}>({
  state: initialState,
  dispatch: () => null,
});

// Create the IncidentContextProvider component
const IncidentContextProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(incidentReducer, initialState);

  return (
    <IncidentContext.Provider value={{ state, dispatch }}>{children}</IncidentContext.Provider>
  );
};

const IncidentContextSetter = () => {
  const { incidentId, journalId } = useParams();
  const { state, dispatch } = useContext(IncidentContext);

  const { loading, data } = useQuery<IncidentDetailsData, IncidentDetailsVars>(GetIncidentDetails, {
    variables: { incidentId: incidentId || "" },
    fetchPolicy: "cache-first",
    skip: incidentId === undefined,
  });

  useEffect(() => {
    if (loading) return;
    // Logic to fetch and set incident and journal based on IDs
    if (incidentId) {
      if (data?.incidentsByPk) {
        if (state.incident?.id !== data.incidentsByPk.id) {
          dispatch({ type: "SET_INCIDENT", payload: data.incidentsByPk });
        }
      }
    } else {
      if (state.incident !== null) {
        dispatch({ type: "SET_INCIDENT", payload: null });
        dispatch({ type: "SET_JOURNAL", payload: null });
      }
    }

    if (journalId) {
      const journal = data?.incidentsByPk.journals.find((j: Journal) => j.id === journalId);
      if (journal) {
        if (state.journal?.id !== journal.id) {
          dispatch({ type: "SET_JOURNAL", payload: journal });
        }
      }
    }
  }, [
    incidentId,
    journalId,
    state.incident,
    state.journal,
    dispatch,
    loading,
    data?.incidentsByPk,
  ]);

  return null;
};
export { IncidentContext, IncidentContextProvider, IncidentContextSetter };
