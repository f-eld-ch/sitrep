import React, { useContext, useReducer, useState } from "react";

import { useMutation } from "@apollo/client";
import { faCircleArrowLeft, faCircleArrowRight, faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import dayjs from "dayjs";
import { t } from "i18next";
import { Link, useParams } from "react-router-dom";
import { Message, PriorityStatus, TriageStatus } from "types";
import { GetJournalMessages, InsertMessage, UpdateMessage } from "./graphql";
import { default as List } from "./List";
import { default as JournalMessage } from "./Message";
import TriageModal from "./TriageModal";

type State = {
  sender: string;
  receiver: string;
  content: string;
  time: Date | undefined
  messageToEdit: Message | undefined
  messageToTriage: Message | undefined
}

type Action = { type: 'clear' } | { type: 'set_edit_message', message: Message | undefined } | { type: 'set_triage_message', message: Message | undefined } | { type: 'set_sender', sender: string } | { type: 'set_receiver'; receiver: string } | { type: 'set_content'; content: string } | { type: 'set_time'; time: Date | undefined } | { type: 'save'; }
type Dispatch = (action: Action) => void


const EditorContext = React.createContext<
  { state: State; dispatch: Dispatch } | undefined
>(undefined)

function Editor() {
  const { journalId } = useParams();
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
        if (state.messageToEdit?.id) {
          updateMessage({
            variables: {
              messageId: state.messageToEdit.id,
              time: state.time,
              journalId: journalId,
              content: state.content,
              sender: state.sender,
              receiver: state.receiver,
            },
          });
        } else {
          insertMessage({
            variables: {
              time: state.time || new Date(),
              journalId: journalId,
              content: state.content,
              sender: state.sender,
              receiver: state.receiver,
            },
          });
        }
        return Object.assign(state, {})
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
      case 'clear': {
        return {
          messageToTriage: undefined,
          messageToEdit: undefined,
          sender: "",
          receiver: "",
          time: undefined,
          content: "",
        }
      }
      case 'set_edit_message': {
        return Object.assign({}, state, {
          messageToEdit: action.message,
          sender: action.message?.sender,
          receiver: action.message?.receiver,
          time: action.message?.time,
          content: action.message?.content
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

  const [state, dispatch] = useReducer(editorReducer, { sender: "", receiver: "", time: undefined, content: "", messageToEdit: undefined, messageToTriage: undefined })


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

enum Medium {
  Radio = "Funk",
  Phone = "Telefon",
  Email = "E-Mail",
}

function InputBox() {
  const { incidentId, journalId } = useParams();

  const [medium, setMedium] = useState(Medium.Radio);

  const renderFormContent = () => {
    if (medium === Medium.Radio) {
      return <RadioInput />;
    }
    if (medium === Medium.Phone) {
      return <PhoneInput />;
    }
    if (medium === Medium.Email) {
      return <EmailInput />;
    }
  };

  const handleMediumChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.preventDefault();
    let selectMedium = e.currentTarget.value;
    if (selectMedium === Medium.Radio || selectMedium === Medium.Email || selectMedium === Medium.Phone) {
      setMedium(selectMedium);
    }
  };

  return (
    <div className="box">
      <Link className="delete is-pulled-right is-small mb-2" to={"/incident/" + incidentId + "/journal/" + journalId} />
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label">Medium</label>
        </div>
        <div className="field-body">
          <div className="field is-narrow">
            <div className="control">
              <div className="select is-fullwidth">
                <select value={medium} onChange={handleMediumChange}>
                  {Object.values(Medium).map((medium: Medium) => (
                    <option key={medium}>{medium}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
      {renderFormContent()}
    </div>
  );
}

function PhoneInput() {
  return (
    <>
      <p>Phone Form</p>
    </>
  );
}

function EmailInput() {
  return (
    <>
      <p>Email Input</p>
    </>
  );
}


function RadioInput() {

  const value = useContext(EditorContext);

  if (!value) return null;

  const { state, dispatch } = value;

  return (
    <div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label is-capitalized">{t('message.receiver')}</label>
        </div>
        <div className="field-body">
          <div className="field">
            <p className="control is-expanded has-icons-left">
              <input
                className="input"
                type="text"
                value={state.receiver}
                autoComplete="on"
                placeholder={t('name')}
                onChange={(e) => {
                  e.preventDefault();
                  dispatch({ type: 'set_receiver', receiver: e.currentTarget.value });
                }}
              />
              <span className="icon is-small is-left">
                <FontAwesomeIcon icon={faCircleArrowRight} />
              </span>
            </p>
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label is-capitalized">{t('message.sender')}</label>
        </div>
        <div className="field-body">
          <div className="field">
            <p className="control is-expanded has-icons-left">
              <input
                className="input"
                type="text"
                value={state.sender}
                autoComplete="on"
                placeholder={t('name')}
                onChange={(e) => {
                  e.preventDefault();
                  dispatch({ type: 'set_sender', sender: e.currentTarget.value });
                }}
              />
              <span className="icon is-small is-left">
                <FontAwesomeIcon icon={faCircleArrowLeft} />
              </span>
            </p>
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label is-capitalized">{t('message.time')}</label>
        </div>
        <div className="field-body">
          <div className="field">
            <p className="control is-expanded has-icons-left">
              <input
                className="input"
                value={dayjs(state.time).format("YYYY-MM-DDTHH:mm")}
                type="datetime-local"
                placeholder={dayjs(Date.now()).format("DD.MM.YYYY HH:mm")}
                onChange={(e) => {
                  e.preventDefault();
                  e.currentTarget.value && dispatch({ type: 'set_time', time: dayjs(e.currentTarget.value).toDate() });
                }}
              />
              <span className="icon is-small is-left">
                <FontAwesomeIcon icon={faClock} />
              </span>
            </p>
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label is-capitalized">{t('message.content')}</label>
        </div>
        <div className="field-body">
          <div className="field">
            <div className="control">
              <textarea
                className="textarea"
                autoFocus={true}
                placeholder={t('message.contentHelp')}
                rows={10}
                value={state.content}
                onChange={(e) => {
                  e.preventDefault();
                  dispatch({ type: 'set_content', content: e.currentTarget.value });
                }}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label"></div>
        <div className="field-body">
          <div className="field">
            <div className="control">
              <button className="button is-primary is-rounded is-capitalized" onClick={() => dispatch({ type: 'save' })}>
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      </div>
      {state.content !== "" || state.sender !== "" || state.receiver !== "" ? (
        <>
          <div className="title is-size-4 is-capitalized">{t('preview')}</div>
          <JournalMessage
            id={undefined}
            message={state.content}
            receiver={state.receiver}
            sender={state.sender}
            timeDate={state.time || new Date()}
            priority={state.messageToEdit?.priority.name || PriorityStatus.Normal}
            triage={state.messageToEdit?.triage.name || TriageStatus.Pending}
            showControls={false}
            origMessage={undefined}
            setEditorMessage={undefined}
            setTriageMessage={undefined}
          />
        </>
      ) : (
        <></>
      )}
    </div>
  );
}

export default Editor;
