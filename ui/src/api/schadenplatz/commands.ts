import { useMutation } from "@apollo/client/react";
import { apiErrorFromApolloError } from "../errors";
import type { CommandHook, CommandState } from "../result";
import { CREATE_SCHADENPLATZ, RECORD_CASUALTIES } from "./documents";

export interface CasualtyDeltas {
  vermisste: number;
  tote: number;
  verletzte: number;
  obdachlose: number;
  eingeschlossene: number;
}

export function useCreateSchadenplatz(): CommandHook<
  { incidentId: string; name: string },
  { id: string }
> {
  const [mutate, { loading, error }] = useMutation(CREATE_SCHADENPLATZ);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const createSchadenplatz = async (args: {
    incidentId: string;
    name: string;
  }): Promise<{ id: string }> => {
    const result = await mutate({
      variables: { incidentId: args.incidentId, name: args.name },
    });
    const id = result.data?.createSchadenplatz?.id;
    if (!id)
      throw Object.assign(new Error("Create Schadenplatz failed"), {
        code: "UNKNOWN" as const,
      });
    return { id };
  };

  return [createSchadenplatz, state];
}

export function useRecordCasualties(): CommandHook<{
  schadenplatzId: string;
  messageId: string;
  deltas: CasualtyDeltas;
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
  }): Promise<void> => {
    await mutate({
      variables: {
        id: args.schadenplatzId,
        sourceMessageId: args.messageId,
        input: args.deltas,
      },
    });
  };

  return [recordCasualties, state];
}
