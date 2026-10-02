import { gql, type Reference } from "@apollo/client";
import { useApolloClient, useMutation } from "@apollo/client/react";
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

interface RecordCasualtiesArgs {
  schadenplatzId: string;
  messageId: string;
  /** Values for this message; they replace whatever the message recorded before. */
  deltas: CasualtyDeltas;
  /** What this message recorded for the Schadenplatz before (re-triage), if anything. */
  previous?: CasualtyDeltas;
  occurredAt?: Date | null;
}

const ZERO_CASUALTIES: CasualtyDeltas = {
  vermisste: 0,
  tote: 0,
  verletzte: 0,
  obdachlose: 0,
  eingeschlossene: 0,
};

const SP_CASUALTIES_FRAGMENT = gql`
  fragment SchadenplatzCasualtiesOnly on Schadenplatz {
    id
    casualties {
      vermisste
      tote
      verletzte
      obdachlose
      eingeschlossene
    }
  }
`;

export function useRecordCasualties(): CommandHook<RecordCasualtiesArgs> {
  const client = useApolloClient();
  const [mutate, { loading, error }] = useMutation(RECORD_CASUALTIES);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const recordCasualties = async (args: RecordCasualtiesArgs): Promise<void> => {
    const previous = args.previous ?? ZERO_CASUALTIES;
    const cached = client.cache.readFragment<{
      id: string;
      casualties: CasualtyDeltas & { __typename?: string };
    }>({
      id: client.cache.identify({
        __typename: "Schadenplatz",
        id: args.schadenplatzId,
      }),
      fragment: SP_CASUALTIES_FRAGMENT,
    });

    // The server replaces this message's earlier values, so the new total is the
    // cached total plus the difference to what the message recorded before.
    const optimisticResponse = cached
      ? {
          recordCasualties: {
            __typename: "Schadenplatz" as const,
            id: args.schadenplatzId,
            casualties: {
              __typename: "Casualties" as const,
              vermisste: cached.casualties.vermisste + args.deltas.vermisste - previous.vermisste,
              tote: cached.casualties.tote + args.deltas.tote - previous.tote,
              verletzte: cached.casualties.verletzte + args.deltas.verletzte - previous.verletzte,
              obdachlose:
                cached.casualties.obdachlose + args.deltas.obdachlose - previous.obdachlose,
              eingeschlossene:
                cached.casualties.eingeschlossene +
                args.deltas.eingeschlossene -
                previous.eingeschlossene,
            },
          },
        }
      : undefined;

    await mutate({
      variables: {
        id: args.schadenplatzId,
        sourceMessageId: args.messageId,
        occurredAt: args.occurredAt?.toISOString() ?? null,
        input: args.deltas,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      optimisticResponse: optimisticResponse as any,
      update(cache) {
        // Touch only this field on the normalized Message so the rest of the cached
        // triage query is left intact.
        cache.modify({
          id: cache.identify({ __typename: "Message", id: args.messageId }),
          fields: {
            schadenplatzCasualties(existing: unknown[] | Reference = []) {
              if (!Array.isArray(existing)) return existing;
              const others = existing.filter(
                (c) => (c as { schadenplatzId?: string }).schadenplatzId !== args.schadenplatzId,
              );
              return [
                ...others,
                {
                  __typename: "SchadenplatzCasualtyEntry",
                  schadenplatzId: args.schadenplatzId,
                  ...args.deltas,
                },
              ];
            },
          },
        });
      },
    });
  };

  return [recordCasualties, state];
}
