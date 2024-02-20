import React, { useCallback, useContext, useEffect, useReducer } from "react";

import { useMutation, useQuery } from "@apollo/client";
import { t } from "i18next";
import uniq from "lodash/uniq";
import { Link, useParams } from "react-router-dom";
import { Medium, Message, MessageListData, MessageListVars, PriorityStatus, TriageStatus } from "types";
import Notification from "utils/Notification";
import useDebounce from "utils/useDebounce";
import { Email, Phone, Radio } from "./EditorForms";
import { RadioChannelDetailInput } from "./EditorForms/Elements";
import { Other } from "./EditorForms/Other";
import { GetJournalMessages, InsertMessage, UpdateMessage } from "./graphql";
import { default as List } from "./List";
import { default as JournalMessage } from './Message';
import TriageModal from "./TriageModal";

type State = {
  sender: string;
  senderDetail: string;
  receiver: string;
  receiverDetail: string;
  content: string;
  time: Date | undefined
  messageToEdit: Message | undefined
  messageToTriage: Message | undefined
  media: Medium
  saving: Boolean
  radioChannel: string;
  autocompleteDetails: AutofillDetail
}

type MediaDetail = PhoneDetail | EmailDetail | RadioDetail | OtherDetail;
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

export type OtherDetail = {
  type: Medium.Other;
  sender?: string;
  receiver?: string;
}

export type RadioDetail = {
  type: Medium.Radio;
  channel?: string;
}

interface AutofillDetail {
  senderReceiverNames: string[]
  channelList: string[]
  senderReceiverDetails: string[]
}

type Action = { type: 'clear' } | { type: 'set_edit_message', message: Message | undefined } | { type: 'set_triage_message', message: Message | undefined } | { type: 'set_sender', sender: string } | { type: 'set_receiver'; receiver: string } | { type: 'set_content'; content: string } | { type: 'set_time'; time: Date | undefined } | { type: 'save'; } | { type: 'set_media_detail', detail: MediaDetail; } | { type: 'set_autofill_details', detail: AutofillDetail; }
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
    receiverDetail: "",
    senderDetail: "",
    time: undefined,
    content: "",
    media: Medium.Radio,
    saving: false,
    radioChannel: "",
    autocompleteDetails: { senderReceiverDetails: [], senderReceiverNames: [], channelList: [] },
  }
}

function Editor() {
  const { journalId } = useParams();
  const { data } = useQuery<MessageListData, MessageListVars>(GetJournalMessages, {
    fetchPolicy: 'cache-first',
    variables: { journalId: journalId || "" },
  });

  const [insertMessage, { error }] = useMutation(InsertMessage, {
    onCompleted(data) {
      // reset the form values
      dispatch({ type: 'clear' })
    },
    refetchQueries: [{ query: GetJournalMessages, variables: { journalId: journalId } }],
  });

  const [updateMessage, { error: errorUpdate }] = useMutation(UpdateMessage, {
    onCompleted(data) {
      // reset the form values
      dispatch({ type: 'clear' })
    },
    refetchQueries: [{ query: GetJournalMessages, variables: { journalId: journalId } }],
  });

  const editorReducer = (state: State, action: Action): State => {
    switch (action.type) {
      case 'save': {
        return Object.assign({}, state, { saving: true })
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
        switch (action.detail.type) {
          case Medium.Radio:
            return Object.assign({}, state, { media: action.detail.type, radioChannel: action.detail.channel })
          default:
            let details = Object.assign({}, { sender: state.senderDetail, receiver: state.receiverDetail }, action.detail)
            return Object.assign({}, state, { media: action.detail.type, senderDetail: details.sender, receiverDetail: details.receiver })
        }
      }
      case 'clear': {
        // keep autocompleteDetails
        return Object.assign({}, initState(), { autocompleteDetails: state.autocompleteDetails });
      }
      case 'set_edit_message': {
        return Object.assign({}, state, {
          messageToEdit: action.message,
          sender: action.message?.sender,
          receiver: action.message?.receiver,
          time: action.message?.time,
          content: action.message?.content,
          media: action.message?.mediumId || Medium.Radio,
          senderDetail: action.message?.senderDetail,
          receiverDetail: action.message?.receiverDetail,
          radioChannel: action.message?.senderDetail,
        })
      }
      case 'set_triage_message': {
        return Object.assign({}, state, {
          messageToTriage: action.message,
        })
      }
      case 'set_autofill_details': {
        return Object.assign({}, state, {
          autocompleteDetails: action.detail,
        })
      }
      default: {
        throw new Error(`Unhandled action type: ${action}`)
      }
    }
  }

  const [state, dispatch] = useReducer(editorReducer, initState())


  useEffect(() => {
    // exit if we don't need to save
    if (!state.saving) return;

    if (state.messageToEdit?.id) {
      updateMessage({
        variables: {
          messageId: state.messageToEdit.id,
          time: state.time,
          journalId: journalId,
          content: state.content,
          type: state.media,
          sender: state.sender,
          senderDetail: state.media !== Medium.Radio ? state.senderDetail : state.radioChannel,
          receiver: state.receiver,
          receiverDetail: state.media !== Medium.Radio ? state.receiverDetail : state.radioChannel,
        },
      });
    } else {
      insertMessage({
        variables: {
          time: state.time || new Date(),
          journalId: journalId,
          content: state.content,
          type: state.media,
          sender: state.sender,
          senderDetail: state.media !== Medium.Radio ? state.senderDetail : state.radioChannel,
          receiver: state.receiver,
          receiverDetail: state.media !== Medium.Radio ? state.receiverDetail : state.radioChannel,
        },
      });
    }
  }, [state, insertMessage, updateMessage, journalId]);

  useEffect(() => {
    dispatch({
      type: 'set_autofill_details', detail:
      {
        senderReceiverNames: uniq(data?.messages.flatMap((d) => [d.sender, d.receiver])).filter((e) => e) || [],
        senderReceiverDetails: uniq(data?.messages.filter(d => d.mediumId !== Medium.Radio).flatMap((d) => [d.senderDetail, d.receiverDetail])).filter((e) => e) || [],
        channelList: uniq(data?.messages.filter(d => d.mediumId === Medium.Radio).map((d) => d.senderDetail)).filter((e) => e) || [],
      }
    })
  }, [data, journalId])


  // create callbacks to have stable List renderings
  const setEditorMessage = useCallback(
    (message: Message | undefined) => dispatch({ type: "set_edit_message", message: message }),
    [dispatch],
  );
  const setTriageMessage = useCallback(
    (message: Message | undefined) => dispatch({ type: "set_triage_message", message: message }),
    [dispatch],
  );

  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      <div>
        <div className="columns">
          <div className="column is-half">
            <h3 className="title is-3 is-capitalized">{t('editor')}</h3>
            {error && <Notification type="error">{error?.message}</Notification>}
            {errorUpdate && < Notification type="error">{errorUpdate?.message}</Notification>}
            <InputBox />
          </div>
          <div className="column">
            <List
              showControls={true}
              setEditorMessage={setEditorMessage}
              setTriageMessage={setTriageMessage}
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

  // debounce the content to prevent costly markdown renderings
  const messageContentDebounced: string = useDebounce(state.content, 250);

  const renderFormContent = () => {
    if (state.media === Medium.Radio) {
      return <Radio />;
    }
    if (state.media === Medium.Phone) {
      return <Phone />;
    }
    if (state.media === Medium.Email) {
      return <Email />;
    }
    if (state.media === Medium.Other) {
      return <Other />;
    }
  };

  const handleMediumChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.preventDefault();
    let selectMedium = e.target.value;
    if (selectMedium === Medium.Radio || selectMedium === Medium.Email || selectMedium === Medium.Phone || selectMedium === Medium.Other) {
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
                <select value={state.media} onChange={handleMediumChange}>
                  {Object.values(Medium).map((medium: Medium) => (
                    <option key={medium} label={t([`medium.${medium}`, `medium.${Medium.Other}`]) as string}>{medium}</option>
                  ))}
                </select>
              </div>
            </div>
            {state.media === Medium.Radio && <RadioChannelDetailInput />}
          </div>
        </div>
      </div >
      {renderFormContent()}
      {state.content !== "" || state.sender !== "" || state.receiver !== "" ? (
        <>
          <div className="title is-size-4 is-capitalized">{t('preview')}</div>
          <JournalMessage
            id={undefined}
            message={messageContentDebounced}
            receiver={state.receiver}
            sender={state.sender}
            timeDate={state.time || new Date()}
            priority={state.messageToEdit?.priorityId || PriorityStatus.Normal}
            triage={state.messageToEdit?.triageId || TriageStatus.Pending}
            showControls={false}
            origMessage={undefined}
            setEditorMessage={undefined}
            setTriageMessage={undefined}
          />
        </>
      ) : (
        <></>
      )}
    </div >
  );
}


export function useEditorContext(): { state: State; dispatch: Dispatch } {
  const context = useContext(EditorContext);
  return context;
}

export default Editor;