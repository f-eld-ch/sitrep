import { useMutation } from "@apollo/client/react";
import { apiErrorFromApolloError } from "../errors";
import { GET_LAYERS } from "../layer/documents";
import type { CommandHook, CommandState } from "../result";
import {
  CLOSE_INCIDENT,
  CREATE_INCIDENT,
  CREATE_INCIDENT_WITH_PARENT,
  DELETE_INCIDENT,
  GET_INCIDENTS,
  LINK_INCIDENT_PARENT,
  REOPEN_INCIDENT,
  UNLINK_INCIDENT_PARENT,
  UPDATE_INCIDENT,
} from "./documents";

export interface CreateIncidentArgs {
  name: string;
  parentId?: string;
  location: string;
  divisions: { name: string; description: string }[];
  layerName: string;
}

export interface UpdateIncidentArgs {
  incidentId: string;
  name: string;
  location: string;
  divisions: { id?: string; name: string; description: string }[];
}

export interface LinkIncidentParentArgs {
  childId: string;
  parentId: string;
}

export interface UnlinkIncidentParentArgs {
  childId: string;
  parentId?: string | null;
}

export function useCreateIncident(): CommandHook<CreateIncidentArgs, { incidentId: string }> {
  const [mutate, { loading, error }] = useMutation(CREATE_INCIDENT);
  const [mutateWithParent, { loading: loadingWithParent, error: errorWithParent }] = useMutation(
    CREATE_INCIDENT_WITH_PARENT,
  );
  const mutationError = error ?? errorWithParent;

  const state: CommandState = {
    loading: loading || loadingWithParent,
    error: mutationError ? apiErrorFromApolloError(mutationError) : undefined,
  };

  const createIncident = async (args: CreateIncidentArgs): Promise<{ incidentId: string }> => {
    const variables = {
      name: args.name,
      location: args.location || undefined,
      divisions: args.divisions,
      layers: [{ name: args.layerName }],
    };
    const updateIncidentCache = (newIncident: {
      id: string;
      name: string;
      parentId?: string | null;
    }) => {
      return {
        ...newIncident,
        parentId: args.parentId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        closedAt: null,
        isClosed: false,
        location: null,
      };
    };
    const result = args.parentId
      ? await mutateWithParent({
          variables: { ...variables, parentId: args.parentId },
          refetchQueries: [
            { query: GET_INCIDENTS },
            { query: GET_LAYERS, variables: { incidentId: args.parentId } },
          ],
          update(cache, { data }) {
            if (!data?.createIncident) return;
            const cached = cache.readQuery({ query: GET_INCIDENTS });
            if (!cached) return;
            cache.writeQuery({
              query: GET_INCIDENTS,
              data: { incidents: [...cached.incidents, updateIncidentCache(data.createIncident)] },
            });
          },
        })
      : await mutate({
          variables,
          refetchQueries: [{ query: GET_INCIDENTS }],
          update(cache, { data }) {
            if (!data?.createIncident) return;
            const cached = cache.readQuery({ query: GET_INCIDENTS });
            if (!cached) return;
            cache.writeQuery({
              query: GET_INCIDENTS,
              data: { incidents: [...cached.incidents, updateIncidentCache(data.createIncident)] },
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
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const updateIncident = async (args: UpdateIncidentArgs): Promise<void> => {
    await mutate({
      variables: {
        id: args.incidentId,
        name: args.name,
        location: args.location ?? undefined,
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
    error: error ? apiErrorFromApolloError(error) : undefined,
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
    error: error ? apiErrorFromApolloError(error) : undefined,
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
    error: error ? apiErrorFromApolloError(error) : undefined,
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

export function useLinkIncidentParent(): CommandHook<LinkIncidentParentArgs> {
  const [mutate, { loading, error }] = useMutation(LINK_INCIDENT_PARENT);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const linkIncidentParent = async (args: LinkIncidentParentArgs): Promise<void> => {
    await mutate({
      variables: { childId: args.childId, parentId: args.parentId },
      refetchQueries: [
        { query: GET_INCIDENTS },
        { query: GET_LAYERS, variables: { incidentId: args.childId } },
        { query: GET_LAYERS, variables: { incidentId: args.parentId } },
      ],
    });
  };

  return [linkIncidentParent, state];
}

export function useUnlinkIncidentParent(): CommandHook<UnlinkIncidentParentArgs> {
  const [mutate, { loading, error }] = useMutation(UNLINK_INCIDENT_PARENT);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const unlinkIncidentParent = async (args: UnlinkIncidentParentArgs): Promise<void> => {
    await mutate({
      variables: { childId: args.childId },
      refetchQueries: [
        { query: GET_INCIDENTS },
        { query: GET_LAYERS, variables: { incidentId: args.childId } },
        ...(args.parentId ? [{ query: GET_LAYERS, variables: { incidentId: args.parentId } }] : []),
      ],
    });
  };

  return [unlinkIncidentParent, state];
}
