import { useQuery } from "@apollo/client/react";
import type { Division, Message } from "types";
import type { QueryResult } from "../result";
import { toDivision, toMessage } from "./mapper";
import { GET_MESSAGE_FOR_TRIAGE, GET_MESSAGES } from "./documents";

export interface JournalMessagesData {
  messages: Message[];
  incidentDivisions: Division[];
}

export function useJournalMessages(journalId: string): QueryResult<JournalMessagesData> {
  const { loading, error, data, refetch } = useQuery(GET_MESSAGES, {
    variables: { journalId },
    pollInterval: 10000,
  });

  const refresh = () => void refetch();

  if (loading && !data) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }

  if (error) {
    return {
      status: "error",
      data: data
        ? {
            messages: data.messages.map(toMessage),
            incidentDivisions: data.journalsByPk?.incident?.divisions?.map(toDivision) ?? [],
          }
        : undefined,
      error: Object.assign(new Error(error.message), { code: "NETWORK_ERROR" as const }),
      isRefreshing: false,
      refresh,
    };
  }

  return {
    status: "ready",
    data: {
      messages: (data?.messages ?? []).map(toMessage),
      incidentDivisions: data?.journalsByPk?.incident?.divisions?.map(toDivision) ?? [],
    },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}

export interface MessageForTriageData {
  message: Message;
  incidentDivisions: Division[];
}

export function useMessageForTriage(
  messageId: string | undefined,
): QueryResult<MessageForTriageData> {
  const { loading, error, data, refetch } = useQuery(GET_MESSAGE_FOR_TRIAGE, {
    variables: { messageId: messageId ?? "" },
    skip: !messageId,
    fetchPolicy: "cache-and-network",
  });

  const refresh = () => void refetch();

  if (!messageId || (loading && !data)) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }

  if (error) {
    return {
      status: "error",
      data: undefined,
      error: Object.assign(new Error(error.message), { code: "NETWORK_ERROR" as const }),
      isRefreshing: false,
      refresh,
    };
  }

  const wireMessage = data?.messagesByPk;
  if (!wireMessage) {
    return {
      status: "error",
      data: undefined,
      error: Object.assign(new Error("Message not found"), { code: "NOT_FOUND" as const }),
      isRefreshing: false,
      refresh,
    };
  }

  return {
    status: "ready",
    data: {
      message: toMessage(wireMessage),
      incidentDivisions: wireMessage.journal?.incident.divisions.map(toDivision) ?? [],
    },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}
