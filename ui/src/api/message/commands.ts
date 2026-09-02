import { useMutation } from "@apollo/client/react";
import { Medium, PriorityStatus, TriageStatus, type Division } from "types";
import { apiErrorFromApolloError } from "../errors";
import type { CommandHook, CommandState } from "../result";
import { CREATE_MESSAGE, GET_INCIDENT_MESSAGES, TRIAGE_MESSAGE, UPDATE_MESSAGE } from "./documents";

export interface CreateMessageArgs {
  incidentId: string;
  sender: string;
  receiver: string;
  senderDetail: string;
  receiverDetail: string;
  content: string;
  medium: Medium;
  time: Date;
}

export interface UpdateMessageArgs extends CreateMessageArgs {
  messageId: string;
}

export interface TriageMessageArgs {
  incidentId: string;
  messageId: string;
  priority: PriorityStatus;
  triage: TriageStatus;
  divisionIds: string[];
  divisions: Division[];
}

export function useCreateMessage(): CommandHook<CreateMessageArgs> {
  const [mutate, { loading, error }] = useMutation(CREATE_MESSAGE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const createMessage = async (args: CreateMessageArgs): Promise<void> => {
    await mutate({
      variables: {
        incidentId: args.incidentId,
        sender: args.sender,
        receiver: args.receiver,
        senderDetail: args.senderDetail,
        receiverDetail: args.receiverDetail,
        content: args.content,
        medium: args.medium,
        time: args.time.toISOString(),
      },
      update(cache, { data }) {
        if (!data?.createMessage) return;
        const cached = cache.readQuery({
          query: GET_INCIDENT_MESSAGES,
          variables: { incidentId: args.incidentId },
        });
        if (!cached?.incident) return;
        cache.writeQuery({
          query: GET_INCIDENT_MESSAGES,
          variables: { incidentId: args.incidentId },
          data: {
            incident: {
              ...cached.incident,
              messages: [...cached.incident.messages, data.createMessage],
            },
          },
        });
      },
    });
  };

  return [createMessage, state];
}

export function useUpdateMessage(): CommandHook<UpdateMessageArgs> {
  const [mutate, { loading, error }] = useMutation(UPDATE_MESSAGE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const updateMessage = async (args: UpdateMessageArgs): Promise<void> => {
    await mutate({
      variables: {
        id: args.messageId,
        sender: args.sender,
        receiver: args.receiver,
        senderDetail: args.senderDetail,
        receiverDetail: args.receiverDetail,
        content: args.content,
        medium: args.medium,
        time: args.time.toISOString(),
      },
      // Apollo normalizes by id — the cached message is updated immediately
      // from the mutation response without a projection read.
    });
  };

  return [updateMessage, state];
}

export function useTriageMessage(): CommandHook<TriageMessageArgs> {
  const [mutate, { loading, error }] = useMutation(TRIAGE_MESSAGE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const triageMessage = async (args: TriageMessageArgs): Promise<void> => {
    await mutate({
      variables: {
        id: args.messageId,
        priority: args.priority,
        triage: args.triage,
        divisionIds: args.divisionIds,
      },
      optimisticResponse: {
        triageMessage: {
          id: args.messageId,
          triage: args.triage,
          priority: args.triage === TriageStatus.MoreInfo ? PriorityStatus.Normal : args.priority,
          divisions: args.divisions,
        },
      },
      update(cache, { data }) {
        if (!data?.triageMessage) return;
        const updated = data.triageMessage;
        const cached = cache.readQuery({
          query: GET_INCIDENT_MESSAGES,
          variables: { incidentId: args.incidentId },
        });
        if (!cached?.incident) return;
        // Server returns full division objects; fall back to resolving from the
        // incident's cached divisions if the server response is empty (shouldn't happen).
        const divisions =
          updated.divisions.length > 0
            ? updated.divisions
            : cached.incident.divisions.filter((d) => args.divisionIds.includes(d.id));
        cache.writeQuery({
          query: GET_INCIDENT_MESSAGES,
          variables: { incidentId: args.incidentId },
          data: {
            incident: {
              ...cached.incident,
              messages: cached.incident.messages.map((m) =>
                m.id === updated.id ? { ...m, ...updated, divisions } : m,
              ),
            },
          },
        });
      },
    });
  };

  return [triageMessage, state];
}
