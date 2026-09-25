import { useMutation } from "@apollo/client/react";
import { apiErrorFromApolloError } from "../errors";
import type { CommandHook, CommandState } from "../result";
import { GET_INCIDENT_RESOURCES } from "../resource/documents";
import { CREATE_SCHADENPLATZ, RECORD_CASUALTIES } from "./documents";

export interface CasualtyDeltas {
  vermisste: number;
  tote: number;
  verletzte: number;
  obdachlose: number;
  eingeschlossene: number;
}

export function useCreateSchadenplatz(): CommandHook<
  { incidentId: string; name: string; tempId?: string; occurredAt?: Date | null },
  { id: string; tempId: string }
> {
  const [mutate, { loading, error }] = useMutation(CREATE_SCHADENPLATZ);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const createSchadenplatz = async (args: {
    incidentId: string;
    name: string;
    tempId?: string;
    occurredAt?: Date | null;
  }): Promise<{ id: string; tempId: string }> => {
    const tempId = args.tempId ?? `__optimistic_sp_${Date.now()}`;
    const result = await mutate({
      variables: {
        incidentId: args.incidentId,
        name: args.name,
        occurredAt: args.occurredAt?.toISOString() ?? null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      optimisticResponse: {
        createSchadenplatz: {
          __typename: "Schadenplatz",
          id: tempId,
          incidentId: args.incidentId,
          name: args.name,
          isDefault: false,
          isMerged: false,
          mergedInto: null,
          casualties: { vermisste: 0, tote: 0, verletzte: 0, obdachlose: 0, eingeschlossene: 0 },
        },
      } as any,
      update(cache, { data }) {
        if (!data?.createSchadenplatz) return;
        const sp = data.createSchadenplatz;
        const cached = cache.readQuery({
          query: GET_INCIDENT_RESOURCES,
          variables: { incidentId: args.incidentId },
        });
        if (!cached?.incident) return;
        // Idempotent: skip if already present (real response after optimistic)
        if (cached.incident.schadenplaetze.some((s) => s.id === sp.id)) return;
        cache.writeQuery({
          query: GET_INCIDENT_RESOURCES,
          variables: { incidentId: args.incidentId },
          data: {
            incident: {
              ...cached.incident,
              schadenplaetze: [
                ...cached.incident.schadenplaetze,
                // New SP starts with no resources
                { ...sp, resources: [] },
              ],
            },
          },
        });
      },
    });
    const id = result.data?.createSchadenplatz?.id;
    if (!id)
      throw Object.assign(new Error("Create Schadenplatz failed"), {
        code: "UNKNOWN" as const,
      });
    return { id, tempId };
  };

  return [createSchadenplatz, state];
}

export function useRecordCasualties(): CommandHook<{
  schadenplatzId: string;
  messageId: string;
  deltas: CasualtyDeltas;
  occurredAt?: Date | null;
}> {
  const [mutate, { loading, error }] = useMutation(RECORD_CASUALTIES);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const recordCasualties = async (args: {
    schadenplatzId: string;
    messageId: string;
    deltas: CasualtyDeltas;
    occurredAt?: Date | null;
  }): Promise<void> => {
    await mutate({
      variables: {
        id: args.schadenplatzId,
        sourceMessageId: args.messageId,
        occurredAt: args.occurredAt?.toISOString() ?? null,
        input: args.deltas,
      },
    });
  };

  return [recordCasualties, state];
}
