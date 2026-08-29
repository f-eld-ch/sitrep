import { useMutation } from "@apollo/client/react";
import type { CommandHook, CommandState } from "../result";
import { afterIncidentWrite } from "../incident/invalidate";
import { CLOSE_JOURNAL, INSERT_JOURNAL } from "./documents";
import { afterJournalWrite } from "./invalidate";

export interface CreateJournalArgs {
  name: string;
  incidentId: string;
}

export function useCreateJournal(): CommandHook<CreateJournalArgs> {
  const [mutate, { loading, error }] = useMutation(INSERT_JOURNAL);

  const state: CommandState = {
    loading,
    error: error
      ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const })
      : undefined,
  };

  const createJournal = async (args: CreateJournalArgs): Promise<void> => {
    await mutate({
      variables: { name: args.name, incidentId: args.incidentId },
      refetchQueries: [
        ...afterJournalWrite(args.incidentId),
        ...afterIncidentWrite(args.incidentId),
      ],
    });
  };

  return [createJournal, state];
}

export function useCloseJournal(): CommandHook<{ journalId: string; incidentId: string }> {
  const [mutate, { loading, error }] = useMutation(CLOSE_JOURNAL);

  const state: CommandState = {
    loading,
    error: error
      ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const })
      : undefined,
  };

  const closeJournal = async ({
    journalId,
    incidentId,
  }: {
    journalId: string;
    incidentId: string;
  }): Promise<void> => {
    await mutate({
      variables: { journalId, closedAt: new Date() },
      refetchQueries: afterJournalWrite(incidentId),
    });
  };

  return [closeJournal, state];
}

export function useReopenJournal(): CommandHook<{ journalId: string; incidentId: string }> {
  const [mutate, { loading, error }] = useMutation(CLOSE_JOURNAL);

  const state: CommandState = {
    loading,
    error: error
      ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const })
      : undefined,
  };

  const reopenJournal = async ({
    journalId,
    incidentId,
  }: {
    journalId: string;
    incidentId: string;
  }): Promise<void> => {
    await mutate({
      variables: { journalId, closedAt: null },
      refetchQueries: afterJournalWrite(incidentId),
    });
  };

  return [reopenJournal, state];
}
