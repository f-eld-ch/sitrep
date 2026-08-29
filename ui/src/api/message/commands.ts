import { useMutation } from "@apollo/client/react";
import { Medium, PriorityStatus, TriageStatus } from "types";
import type { CommandHook, CommandState } from "../result";
import type { InsertMessageVars, SaveMessageTriageVars, UpdateMessageVars } from "./documents";
import { INSERT_MESSAGE, SAVE_MESSAGE_TRIAGE, UPDATE_MESSAGE } from "./documents";
import { afterMessageWrite } from "./invalidate";

export interface CreateMessageArgs {
  journalId: string;
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
  journalId: string;
  messageId: string;
  priority: PriorityStatus;
  triage: TriageStatus;
  divisionIds: string[];
}

export function useCreateMessage(): CommandHook<CreateMessageArgs> {
  const [mutate, { loading, error }] = useMutation(INSERT_MESSAGE);

  const state: CommandState = {
    loading,
    error: error ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const }) : undefined,
  };

  const createMessage = async (args: CreateMessageArgs): Promise<void> => {
    const vars: InsertMessageVars = {
      journalId: args.journalId,
      sender: args.sender,
      receiver: args.receiver,
      senderDetail: args.senderDetail,
      receiverDetail: args.receiverDetail,
      content: args.content,
      medium: args.medium,
      time: args.time,
    };
    await mutate({
      variables: vars,
      refetchQueries: afterMessageWrite(args.journalId),
    });
  };

  return [createMessage, state];
}

export function useUpdateMessage(): CommandHook<UpdateMessageArgs> {
  const [mutate, { loading, error }] = useMutation(UPDATE_MESSAGE);

  const state: CommandState = {
    loading,
    error: error ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const }) : undefined,
  };

  const updateMessage = async (args: UpdateMessageArgs): Promise<void> => {
    const vars: UpdateMessageVars = {
      messageId: args.messageId,
      sender: args.sender,
      receiver: args.receiver,
      senderDetail: args.senderDetail,
      receiverDetail: args.receiverDetail,
      content: args.content,
      medium: args.medium,
      time: args.time,
    };
    await mutate({
      variables: vars,
      refetchQueries: afterMessageWrite(args.journalId),
    });
  };

  return [updateMessage, state];
}

export function useTriageMessage(): CommandHook<TriageMessageArgs> {
  const [mutate, { loading, error }] = useMutation(SAVE_MESSAGE_TRIAGE);

  const state: CommandState = {
    loading,
    error: error ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const }) : undefined,
  };

  const triageMessage = async (args: TriageMessageArgs): Promise<void> => {
    // TODO(gqlgen): replace the delete-then-reinsert with a single atomic
    // triageMessage mutation once the Go backend lands. This relies on Hasura's
    // multi-root transactionality: if insertMessageDivision fails after
    // deleteMessageDivision commits, the message loses all division assignments.
    const vars: SaveMessageTriageVars = {
      messageId: args.messageId,
      priority: args.priority,
      triage: args.triage,
      messageDivisions: args.divisionIds.map((divisionId) => ({
        messageId: args.messageId,
        divisionId,
      })),
    };
    await mutate({
      variables: vars,
      refetchQueries: afterMessageWrite(args.journalId),
    });
  };

  return [triageMessage, state];
}
