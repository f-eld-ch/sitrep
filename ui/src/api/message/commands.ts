import { useApolloClient, useMutation } from "@apollo/client/react";
import { useState } from "react";
import { Medium, PriorityStatus, TriageStatus, type Attachment, type Division } from "types";
import { ApiError, apiErrorFromApolloError } from "../errors";
import type { CommandHook, CommandState } from "../result";
import {
  CREATE_MESSAGE,
  GET_INCIDENT_MESSAGES,
  REMOVE_ATTACHMENT,
  TRIAGE_MESSAGE,
  UPDATE_MESSAGE,
} from "./documents";

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

export function useCreateMessage(): CommandHook<CreateMessageArgs, string> {
  const [mutate, { loading, error }] = useMutation(CREATE_MESSAGE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const createMessage = async (args: CreateMessageArgs): Promise<string> => {
    const result = await mutate({
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
              messages: [...cached.incident.messages, { ...data.createMessage, attachments: [] }],
            },
          },
        });
      },
    });
    return result.data?.createMessage?.id ?? "";
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

export interface RemoveAttachmentArgs {
  incidentId: string;
  messageId: string;
  attachmentId: string;
}

export function useRemoveAttachment(): CommandHook<RemoveAttachmentArgs> {
  const [mutate, { loading, error }] = useMutation(REMOVE_ATTACHMENT);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const removeAttachment = async (args: RemoveAttachmentArgs): Promise<void> => {
    await mutate({
      variables: { messageId: args.messageId, attachmentId: args.attachmentId },
      optimisticResponse: { removeAttachment: args.attachmentId },
      update(cache) {
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
              messages: cached.incident.messages.map((m) =>
                m.id === args.messageId
                  ? { ...m, attachments: m.attachments.filter((a) => a.id !== args.attachmentId) }
                  : m,
              ),
            },
          },
        });
      },
    });
  };

  return [removeAttachment, state];
}

export interface UploadAttachmentArgs {
  incidentId: string;
  messageId: string;
  file: File;
}

export function useUploadAttachment(): CommandHook<UploadAttachmentArgs, Attachment> {
  const client = useApolloClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | undefined>(undefined);

  const state: CommandState = { loading, error };

  const uploadAttachment = async (args: UploadAttachmentArgs): Promise<Attachment> => {
    setLoading(true);
    setError(undefined);

    try {
      const formData = new FormData();
      formData.append("file", args.file, args.file.name);

      const response = await fetch(`/api/v2/messages/${args.messageId}/attachments`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: { "X-Sitrep-Upload": "1" },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.status === 413) throw new ApiError("ATTACHMENT_TOO_LARGE");
        if (response.status === 501) throw new ApiError("ATTACHMENT_DISABLED");
        throw new ApiError("UNKNOWN", body.error ?? `upload failed: ${response.status}`);
      }

      const data = (await response.json()) as {
        ID: string;
        Filename: string;
        ContentType: string;
        Size: number;
        CreatedAt: string;
        UploaderSub: string;
        URL: string;
      };

      const attachment: Attachment = {
        id: data.ID,
        filename: data.Filename,
        contentType: data.ContentType,
        size: data.Size,
        createdAt: new Date(data.CreatedAt),
        uploadedBy: data.UploaderSub,
        url: data.URL,
      };

      // Optimistically update the Apollo cache so the UI reflects the new attachment immediately.
      const cached = client.readQuery({
        query: GET_INCIDENT_MESSAGES,
        variables: { incidentId: args.incidentId },
      });

      if (cached?.incident) {
        client.writeQuery({
          query: GET_INCIDENT_MESSAGES,
          variables: { incidentId: args.incidentId },
          data: {
            incident: {
              ...cached.incident,
              messages: cached.incident.messages.map((m) =>
                m.id === args.messageId
                  ? {
                      ...m,
                      attachments: [
                        ...m.attachments,
                        {
                          id: attachment.id,
                          filename: attachment.filename,
                          contentType: attachment.contentType,
                          size: attachment.size,
                          createdAt: attachment.createdAt.toISOString(),
                          uploadedBy: attachment.uploadedBy,
                          url: attachment.url,
                        },
                      ],
                    }
                  : m,
              ),
            },
          },
        });
      }

      return attachment;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("UNKNOWN"));
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return [uploadAttachment, state];
}
