import { useMutation } from "@apollo/client/react";
import type { CommandHook, CommandState } from "../result";
import { CLOSE_INCIDENT, DELETE_INCIDENT, INSERT_INCIDENT, UPDATE_INCIDENT } from "./documents";
import { afterIncidentWrite } from "./invalidate";

export interface CreateIncidentArgs {
  name: string;
  location: string;
  divisions: { name: string; description: string }[];
  journalName: string;
  layerName: string;
}

export interface UpdateIncidentArgs {
  incidentId: string;
  name: string;
  location: string;
  locationId: string;
  divisions: { name: string; description: string; incidentId: string }[];
}

export function useCreateIncident(): CommandHook<CreateIncidentArgs, { incidentId: string }> {
  const [mutate, { loading, error }] = useMutation(INSERT_INCIDENT);

  const state: CommandState = {
    loading,
    error: error
      ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const })
      : undefined,
  };

  const createIncident = async (args: CreateIncidentArgs): Promise<{ incidentId: string }> => {
    const result = await mutate({
      variables: {
        name: args.name,
        location: args.location,
        divisions: args.divisions,
        journalName: args.journalName,
        layerName: args.layerName,
      },
      refetchQueries: afterIncidentWrite(),
    });
    const incidentId = result.data?.insertIncidentsOne?.id;
    if (!incidentId)
      throw Object.assign(new Error("Create incident failed"), { code: "UNKNOWN" as const });
    return { incidentId };
  };

  return [createIncident, state];
}

export function useUpdateIncident(): CommandHook<UpdateIncidentArgs> {
  const [mutate, { loading, error }] = useMutation(UPDATE_INCIDENT);

  const state: CommandState = {
    loading,
    error: error
      ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const })
      : undefined,
  };

  const updateIncident = async (args: UpdateIncidentArgs): Promise<void> => {
    await mutate({
      variables: {
        incidentId: args.incidentId,
        name: args.name,
        location: args.location,
        locationId: args.locationId,
        divisions: args.divisions,
      },
      refetchQueries: afterIncidentWrite(args.incidentId),
    });
  };

  return [updateIncident, state];
}

export function useCloseIncident(): CommandHook<{ incidentId: string }> {
  const [mutate, { loading, error }] = useMutation(CLOSE_INCIDENT);

  const state: CommandState = {
    loading,
    error: error
      ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const })
      : undefined,
  };

  const closeIncident = async ({ incidentId }: { incidentId: string }): Promise<void> => {
    // TODO(gqlgen): replace the updateJournals root with a single closeIncident mutation.
    // Today this relies on Hasura multi-root transactionality to cascade the close to journals.
    await mutate({
      variables: { incidentId, closedAt: new Date() },
      refetchQueries: afterIncidentWrite(incidentId),
    });
  };

  return [closeIncident, state];
}

export function useReopenIncident(): CommandHook<{ incidentId: string }> {
  const [mutate, { loading, error }] = useMutation(CLOSE_INCIDENT);

  const state: CommandState = {
    loading,
    error: error
      ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const })
      : undefined,
  };

  const reopenIncident = async ({ incidentId }: { incidentId: string }): Promise<void> => {
    await mutate({
      variables: { incidentId, closedAt: null },
      refetchQueries: afterIncidentWrite(incidentId),
    });
  };

  return [reopenIncident, state];
}

export function useDeleteIncident(): CommandHook<{ incidentId: string }> {
  const [mutate, { loading, error }] = useMutation(DELETE_INCIDENT);

  const state: CommandState = {
    loading,
    error: error
      ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const })
      : undefined,
  };

  const deleteIncident = async ({ incidentId }: { incidentId: string }): Promise<void> => {
    const result = await mutate({
      variables: { incidentId, deletedAt: new Date() },
      refetchQueries: afterIncidentWrite(incidentId),
    });
    // Hasura's where-clause encodes "must be closed and not yet deleted" — affectedRows:0 means
    // the precondition failed. NOTE: this conflates "not closed", "already deleted", and "not
    // found". The Go server will distinguish them and provide better errors.
    const affected = result.data?.updateIncidents?.affectedRows ?? 0;
    if (affected === 0) {
      throw Object.assign(new Error("Incident cannot be deleted: must be closed first"), {
        code: "INCIDENT_NOT_DELETABLE" as const,
      });
    }
  };

  return [deleteIncident, state];
}
