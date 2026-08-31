import { useMutation } from "@apollo/client/react";
import type { CommandHook, CommandState } from "../result";
import {
  CLOSE_INCIDENT,
  CREATE_INCIDENT,
  DELETE_INCIDENT,
  GET_INCIDENTS,
  REOPEN_INCIDENT,
  UPDATE_INCIDENT,
} from "./documents";

export interface CreateIncidentArgs {
  name: string;
  location: string;
  divisions: { name: string; description: string }[];
  layerName: string;
}

export interface UpdateIncidentArgs {
  incidentId: string;
  name: string;
  location: string;
  divisions: { name: string; description: string }[];
}

export function useCreateIncident(): CommandHook<CreateIncidentArgs, { incidentId: string }> {
  const [mutate, { loading, error }] = useMutation(CREATE_INCIDENT);

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
        location: args.location || undefined,
        divisions: args.divisions,
        layers: [{ name: args.layerName }],
      },
      update(cache, { data }) {
        if (!data?.createIncident) return;
        const newIncident = data.createIncident;
        const cached = cache.readQuery({ query: GET_INCIDENTS });
        if (!cached) return;
        cache.writeQuery({
          query: GET_INCIDENTS,
          data: {
            incidents: [
              ...cached.incidents,
              {
                ...newIncident,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                closedAt: null,
                isClosed: false,
                location: null,
              },
            ],
          },
        });
      },
    });
    const incidentId = result.data?.createIncident?.id;
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
        id: args.incidentId,
        name: args.name,
        location: args.location || undefined,
        divisions: args.divisions,
      },
      // Apollo normalizes Incident:${id} — list and detail queries update automatically.
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
    await mutate({
      variables: { id: incidentId },
      // Apollo normalizes Incident:${id} — isClosed/closedAt update automatically.
    });
  };

  return [closeIncident, state];
}

export function useReopenIncident(): CommandHook<{ incidentId: string }> {
  const [mutate, { loading, error }] = useMutation(REOPEN_INCIDENT);

  const state: CommandState = {
    loading,
    error: error
      ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const })
      : undefined,
  };

  const reopenIncident = async ({ incidentId }: { incidentId: string }): Promise<void> => {
    await mutate({
      variables: { id: incidentId },
      // Apollo normalizes Incident:${id} — isClosed/closedAt update automatically.
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
    await mutate({
      variables: { id: incidentId },
      update(cache) {
        cache.evict({ id: cache.identify({ __typename: "Incident", id: incidentId }) });
        cache.gc();
      },
    });
  };

  return [deleteIncident, state];
}
