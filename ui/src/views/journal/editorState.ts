import React, { useContext } from "react";
import type { CreateMessageArgs } from "api";
import { Medium, type Message } from "types";

export interface EditorState {
  sender: string;
  senderDetail: string;
  receiver: string;
  receiverDetail: string;
  content: string;
  time: Date | undefined;
  messageToEdit: Message | undefined;
  messageToTriage: Message | undefined;
  media: Medium;
  radioChannel: string;
}

export interface AutofillDetail {
  senderReceiverNames: string[];
  channelList: string[];
  senderReceiverDetails: string[];
}

export type MediaDetail = PhoneDetail | EmailDetail | RadioDetail | OtherDetail;

export interface PhoneDetail {
  type: Medium.Phone;
  sender?: string;
  receiver?: string;
}

export interface EmailDetail {
  type: Medium.Email;
  sender?: string;
  receiver?: string;
}

export interface OtherDetail {
  type: Medium.Other;
  sender?: string;
  receiver?: string;
}

export interface RadioDetail {
  type: Medium.Radio;
  channel?: string;
}

export type EditorAction =
  | { type: "clear" }
  | { type: "set_edit_message"; message: Message }
  | { type: "set_triage_message"; message: Message | undefined }
  | { type: "set_sender"; sender: string }
  | { type: "set_receiver"; receiver: string }
  | { type: "set_content"; content: string }
  | { type: "set_time"; time: Date | undefined }
  | { type: "set_media_detail"; detail: MediaDetail };

export type EditorDispatch = (action: EditorAction) => void;

export interface EditorContextValue {
  state: EditorState;
  dispatch: EditorDispatch;
  onSave: () => void;
  saving: boolean;
  autocompleteDetails: AutofillDetail;
}

export const EditorContext = React.createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (ctx === null) throw new Error("useEditorContext must be used within EditorContext.Provider");
  return ctx;
}

export function initEditorState(): EditorState {
  return {
    messageToTriage: undefined,
    messageToEdit: undefined,
    sender: "",
    receiver: "",
    receiverDetail: "",
    senderDetail: "",
    time: undefined,
    content: "",
    media: Medium.Radio,
    radioChannel: "",
  };
}

export function isNonEmptyString(v: string | null | undefined): v is string {
  return typeof v === "string" && v.length > 0;
}

export function hasValidMessageTime(time: Date | undefined, now = new Date()): boolean {
  return time === undefined || time.getTime() <= now.getTime() + 5 * 60 * 1000;
}

export function canSave(state: EditorState, now = new Date()): boolean {
  if (state.content.trim() === "" || state.sender.trim() === "" || state.receiver.trim() === "") {
    return false;
  }
  if (!hasValidMessageTime(state.time, now)) {
    return false;
  }
  if (state.media === Medium.Phone || state.media === Medium.Email) {
    return state.senderDetail.trim() !== "" && state.receiverDetail.trim() !== "";
  }
  return true;
}

export function buildMessageVars(
  state: EditorState,
  incidentId: string,
  now: Date,
): CreateMessageArgs {
  const time = state.time ?? now;
  const senderDetail = state.media !== Medium.Radio ? state.senderDetail : state.radioChannel;
  const receiverDetail = state.media !== Medium.Radio ? state.receiverDetail : state.radioChannel;
  return {
    time,
    incidentId,
    content: state.content,
    medium: state.media,
    sender: state.sender,
    senderDetail,
    receiver: state.receiver,
    receiverDetail,
  };
}

export const editorReducer = (state: EditorState, action: EditorAction): EditorState => {
  switch (action.type) {
    case "set_sender":
      return { ...state, sender: action.sender };
    case "set_receiver":
      return { ...state, receiver: action.receiver };
    case "set_content":
      return { ...state, content: action.content };
    case "set_time":
      return { ...state, time: action.time };
    case "set_media_detail": {
      const details = {
        sender: state.senderDetail,
        receiver: state.receiverDetail,
        ...action.detail,
      };
      switch (details.type) {
        case Medium.Radio:
          return { ...state, media: details.type, radioChannel: details.channel || "" };
        default:
          return {
            ...state,
            media: details.type,
            senderDetail: details.sender,
            receiverDetail: details.receiver,
          };
      }
    }
    case "clear":
      return initEditorState();
    case "set_edit_message": {
      const msg = action.message;
      return {
        ...state,
        messageToEdit: msg,
        sender: msg.sender,
        receiver: msg.receiver,
        time: msg.time,
        content: msg.content,
        media: msg.medium,
        senderDetail: msg.medium !== Medium.Radio ? msg.senderDetail : "",
        receiverDetail: msg.medium !== Medium.Radio ? msg.receiverDetail : "",
        radioChannel: msg.medium === Medium.Radio ? msg.senderDetail : "",
      };
    }
    case "set_triage_message":
      return { ...state, messageToTriage: action.message };
    default:
      throw new Error(`Unhandled action type: ${JSON.stringify(action)}`);
  }
};
