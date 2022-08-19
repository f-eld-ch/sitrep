import React, { useContext, useReducer } from "react";

import { useMutation } from "@apollo/client";
import { t } from "i18next";
import { Link, useParams } from "react-router-dom";
import { Medium, Message } from "types";
import { Email, Phone, Radio } from "./EditorForms";
import { GetJournalMessages, InsertMessage, UpdateMessage } from "./graphql";
import { default as List } from "./List";
import TriageModal from "./TriageModal";

type State = {
  sender: string;
  receiver: string;
  content: string;
  time: Date | undefined
  messageToEdit: Message | undefined
  messageToTriage: Message | undefined
  media: MediaDetail
}

type MediaDetail = PhoneDetail | EmailDetail | RadioDetail;
export type PhoneDetail = {
  type: Medium.Phone;
  sender?: string;
  receiver?: string;
}

export type EmailDetail = {
  type: Medium.Email;
  sender?: string;
  receiver?: string;
}

export type RadioDetail = {
  type: Medium.Radio;
  channel?: string;
}

type Action = { type: 'clear' } | { type: 'set_edit_message', message: Message | undefined } | { type: 'set_triage_message', message: Message | undefined } | { type: 'set_sender', sender: string } | { type: 'set_receiver'; receiver: string } | { type: 'set_content'; content: string } | { type: 'set_time'; time: Date | undefined } | { type: 'save'; } | { type: 'set_media_detail', detail: MediaDetail; }
type Dispatch = (action: Action) => void


export const EditorContext = React.createContext<
  { state: State; dispatch: Dispatch }
>({ state: initState(), dispatch: (action: Action) => { } })


function initState(): State {
  return {
    messageToTriage: undefined,
    messageToEdit: undefined,
    sender: "",
    receiver: "",
    time: undefined,
    content: "",
    media: { type: Medium.Radio },
  }
}

function Editor() {
  const { journalId } = useParams();
  const [insertMessage, { error }] = useMutation(InsertMessage, {
    onCompleted(data) {
      // reset the form values
      dispatch({ type: 'clear' })
    },
    fetchPolicy: 'network-only',
    refetchQueries: [{ query: GetJournalMessages, variables: { journalId: journalId } }],
  });

  const [updateMessage, { error: errorUpdate }] = useMutation(UpdateMessage, {
    onCompleted(data) {
      // reset the form values
      dispatch({ type: 'clear' })
    },
    fetchPolicy: 'network-only',
    refetchQueries: [{ query: GetJournalMessages, variables: { journalId: journalId } }],
  });

  const editorReducer = (state: State, action: Action): State => {
    switch (action.type) {
      case 'save': {
        console.log("reducing save", action, state);
        if (state.messageToEdit?.id) {
          updateMessage({
            variables: {
              messageId: state.messageToEdit.id,
              time: state.time,
              journalId: journalId,
              content: state.content,
              type: state.media?.type,
              sender: state.sender,
              senderDetail: state.media?.type !== Medium.Radio ? state.media?.sender : state.media.channel,
              receiver: state.receiver,
              receiverDetail: state.media?.type !== Medium.Radio ? state.media?.receiver : state.media.channel,
            },
          });
          return Object.assign({}, state, {})

        } else {
          console.log("insertMessage")
          insertMessage({
            variables: {
              time: state.time || new Date(),
              journalId: journalId,
              content: state.content,
              type: state.media?.type,
              sender: state.sender,
              senderDetail: state.media?.type !== Medium.Radio ? state.media?.sender : state.media.channel,
              receiver: state.receiver,
              receiverDetail: state.media?.type !== Medium.Radio ? state.media?.receiver : state.media.channel,
            },
          });
        }
        return Object.assign({}, state, {})
      }
      case 'set_sender': {
        return Object.assign({}, state, { sender: action.sender })
      }
      case 'set_receiver': {
        return Object.assign({}, state, { receiver: action.receiver })
      }
      case 'set_content': {
        return Object.assign({}, state, { content: action.content })
      }
      case 'set_time': {
        return Object.assign({}, state, { time: action.time })
      }
      case 'set_media_detail': {
        return Object.assign({}, state, { media: action.detail })
      }
      case 'clear': {
        return initState()
      }
      case 'set_edit_message': {
        return Object.assign({}, state, {
          messageToEdit: action.message,
          sender: action.message?.sender,
          receiver: action.message?.receiver,
          time: action.message?.time,
          content: action.message?.content,
          media: action.message?.mediumId === Medium.Radio ? { type: Medium.Radio, channel: action.message?.senderDetail || action.message?.receiverDetail || "" } : { type: action.message?.mediumId || Medium.Radio, sender: action.message?.senderDetail || "", receiver: action.message?.receiverDetail || "" },
        })
      }
      case 'set_triage_message': {
        return Object.assign({}, state, {
          messageToTriage: action.message,
        })
      }
      default: {
        throw new Error(`Unhandled action type: ${action}`)
      }
    }
  }

  const [state, dispatch] = useReducer(editorReducer, initState())

  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      <div>
        <div className="columns">
          <div className="column is-half">
            <h3 className="title is-3 is-capitalized">{t('editor')}</h3>
            {error ? <div className="notification is-danger">{error?.message}</div> : <></>}
            {errorUpdate ? <div className="notification is-danger">{errorUpdate?.message}</div> : <></>}
            <InputBox />
          </div>
          <div className="column">
            <List
              showControls={true}
              setEditorMessage={(message: Message | undefined) => dispatch({ type: "set_edit_message", message: message })}
              setTriageMessage={(message: Message | undefined) => dispatch({ type: "set_triage_message", message: message })}
            />

          </div>
          <TriageModal message={state.messageToTriage} setMessage={(message: Message | undefined) => dispatch({ type: "set_triage_message", message: message })} />
        </div>
      </div>
    </EditorContext.Provider >
  );
}

function InputBox() {
  const { incidentId, journalId } = useParams();
  const { state, dispatch } = useEditorContext();

  const renderFormContent = () => {
    if (state.media?.type === Medium.Radio) {
      return <Radio />;
    }
    if (state.media?.type === Medium.Phone) {
      return <Phone />;
    }
    if (state.media?.type === Medium.Email) {
      return <Email />;
    }
  };

  const handleMediumChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.preventDefault();
    let selectMedium = e.currentTarget.value;
    if (selectMedium === Medium.Radio || selectMedium === Medium.Email || selectMedium === Medium.Phone) {
      dispatch({ type: 'set_media_detail', detail: { type: selectMedium } });

    }
  };

  return (
    <div className="box">
      <Link className="delete is-pulled-right is-small mb-2" to={"/incident/" + incidentId + "/journal/" + journalId} />
      <div className="mt-5 field is-horizontal">
        <div className="field-label is-normal">
          <label className="label is-capitalized">{t('mediumName')}</label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-grouped-multiline">
            <div className="control is-narrow">
              <div className="select is-fullwidth">
                <select value={state.media?.type} onChange={handleMediumChange}>
                  {Object.values(Medium).map((medium: Medium) => (
                    <option key={medium} label={t([`medium.${medium}`, 'medium.Radio'])}>{medium}</option>
                  ))}
                </select>
              </div>
            </div>
            {state.media.type === Medium.Radio ?
              <div className="control">
                <input
                  className="input"
                  value={state.media.channel || ""}
                  type="text"
                  onChange={(e) => {
                    e.preventDefault();
                    dispatch({ type: 'set_media_detail', detail: { type: Medium.Radio, channel: e.currentTarget.value } });
                  }}
                  placeholder={t('radioChannel')}
                />
              </div>
              : <></>}
          </div>
        </div>
      </div >
      {renderFormContent()}
    </div >
  );
}


export function useEditorContext(): { state: State; dispatch: Dispatch } {
  const context = useContext(EditorContext);
  return context;
}

export default Editor;