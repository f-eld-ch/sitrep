import { useQuery } from "@apollo/client/react";
import type { Division, Message } from "types";
import type { QueryResult } from "../result";
import { toDivision, toMessage } from "./mapper";
import { GET_INCIDENT_MESSAGES, GET_MESSAGE_FOR_TRIAGE } from "./documents";

export interface IncidentMessagesData {
  messages: Message[];
  incidentDivisions: Division[];
}

/** @deprecated use useIncidentMessages */
export type JournalMessagesData = IncidentMessagesData;

export function useIncidentMessages(incidentId: string): QueryResult<IncidentMessagesData> {
  const { loading, error, data, refetch } = useQuery(GET_INCIDENT_MESSAGES, {
    variables: { incidentId },
    skip: !incidentId,
    pollInterval: 10000,
  });

  const refresh = () => void refetch();

  if (!incidentId || (loading && !data)) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }

  if (error) {
    return {
      status: "error",
      data: data?.incident
        ? {
            messages: (data.incident.messages ?? []).map(toMessage),
            incidentDivisions: data.incident.divisions.map(toDivision),
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
      messages: (data?.incident?.messages ?? []).map(toMessage),
      incidentDivisions: (data?.incident?.divisions ?? []).map(toDivision),
    },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}

/** @deprecated use useIncidentMessages */
export function useJournalMessages(incidentId: string): QueryResult<IncidentMessagesData> {
  return useIncidentMessages(incidentId);
}

export interface MessageForTriageData {
  message: Message;
  incidentDivisions: Division[];
}

export function useMessageForTriage(
  messageId: string | undefined,
  incidentId?: string,
): QueryResult<MessageForTriageData> {
  const { loading, error, data, refetch } = useQuery(GET_MESSAGE_FOR_TRIAGE, {
    variables: { messageId: messageId ?? "", incidentId: incidentId ?? "" },
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

  const wireMessage = data?.message;
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
      incidentDivisions: (data?.incident?.divisions ?? []).map(toDivision),
    },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}
