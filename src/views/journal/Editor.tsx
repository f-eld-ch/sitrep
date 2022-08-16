import React, { useEffect, useState } from "react";

import List, { GET_MESSAGES } from "./List";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleArrowLeft, faCircleArrowRight, faClock } from "@fortawesome/free-solid-svg-icons";

import { Link, useParams } from "react-router-dom";
import dayjs from "dayjs";
import { Message, PriorityStatus, TriageStatus } from "types";
import { gql, useMutation } from "@apollo/client";
import JournalMessage from "components/JournalMessage";
import TriageModal from "./TriageModal";
import { t } from "i18next";

function Editor() {
  const [messageToEdit, setMessageToEdit] = useState<Message>();
  const [messageToTriage, setMessageToTriage] = useState<Message>();
  return (
    <div>
      <div className="columns">
        <div className="column is-half">
          <h3 className="title is-3 is-capitalized">{t('editor')}</h3>
          <InputBox messageToEdit={messageToEdit} setEditorMessage={setMessageToEdit} />
        </div>
        <div className="column">
          <List showControls={true} setEditorMessage={setMessageToEdit} setTriageMessage={setMessageToTriage} />
        </div>
        <TriageModal message={messageToTriage} setMessage={setMessageToTriage} />
      </div>
    </div>
  );
}

enum Medium {
  Radio = "Funk",
  Phone = "Telefon",
  Email = "E-Mail",
}

function InputBox(props: {
  messageToEdit: Message | undefined;
  setEditorMessage: React.Dispatch<React.SetStateAction<Message | undefined>>;
}) {
  const { incidentId, journalId } = useParams();
  const { messageToEdit, setEditorMessage } = props;
  const [medium, setMedium] = useState(Medium.Radio);

  const renderFormContent = () => {
    if (medium === Medium.Radio) {
      return <RadioInput messageToEdit={messageToEdit} setEditorMessage={setEditorMessage} />;
    }
    if (medium === Medium.Phone) {
      return <PhoneInput />;
    }
    if (medium === Medium.Email) {
      return <EmailInput />;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
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
                <select value={medium} onChange={handleChange}>
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

const INSERT_MESSAGE = gql`
  mutation InsertMessage($journalId: uuid, $sender: String, $receiver: String, $time: timestamptz, $content: String) {
    insert_messages_one(
      object: { content: $content, journalId: $journalId, receiver: $receiver, sender: $sender, time: $time }
    ) {
      id
      createdAt
      content
      receiver
      sender
      time
      updatedAt
      priority {
        name
      }
      triage {
        name
      }
      divisions {
        division {
          name
        }
      }
      deletedAt
    }
  }
`;

const UPDATE_MESSAGE = gql`
  mutation UpdateMessage($messageId: uuid!, $content: String, $sender: String, $receiver: String, $time: timestamptz) {
    update_messages_by_pk(
      pk_columns: { id: $messageId }
      _set: { content: $content, sender: $sender, receiver: $receiver, time: $time }
    ) {
      id
      createdAt
      content
      receiver
      sender
      time
      updatedAt
      priority {
        name
      }
      triage {
        name
      }
      divisions {
        division {
          name
        }
      }
      deletedAt
    }
  }
`;

function RadioInput(props: {
  messageToEdit: Message | undefined;
  setEditorMessage: React.Dispatch<React.SetStateAction<Message | undefined>>;
}) {
  const { journalId } = useParams();
  const { messageToEdit, setEditorMessage } = props;
  const [sender, setSender] = useState("");
  const [receiver, setReceiver] = useState("");
  const [content, setContent] = useState("");
  const [time, setTime] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (messageToEdit !== undefined) {
      setSender(messageToEdit.sender);
      setReceiver(messageToEdit.receiver);
      setContent(messageToEdit.content);
      setTime(dayjs(messageToEdit.time).toDate());
    }
  }, [messageToEdit]);

  const [insertMessage, { error }] = useMutation(INSERT_MESSAGE, {
    onCompleted(data) {
      // reset the form values
      setSender("");
      setReceiver("");
      setContent("");
      setTime(undefined);
    },
    refetchQueries: [{ query: GET_MESSAGES, variables: { journalId: journalId } }],
  });

  const [updateMessage, { error: errorUpdate }] = useMutation(UPDATE_MESSAGE, {
    onCompleted(data) {
      // reset the form values
      setEditorMessage(undefined);
      setSender("");
      setReceiver("");
      setContent("");
      setTime(undefined);
    },
    refetchQueries: [{ query: GET_MESSAGES, variables: { journalId: journalId } }],
  });

  const handleSave = () => {
    if (messageToEdit?.id) {
      updateMessage({
        variables: {
          messageId: messageToEdit.id,
          time: time || dayjs(messageToEdit.time).toDate(),
          journalId: journalId,
          content: content || messageToEdit.content,
          sender: sender || messageToEdit.sender,
          receiver: receiver || messageToEdit.receiver,
        },
      });
    } else {
      insertMessage({
        variables: {
          time: time || new Date(),
          journalId: journalId,
          content: content,
          sender: sender,
          receiver: receiver,
        },
      });
    }
  };

  return (
    <div>
      {error ? <div className="notification is-danger">{error?.message}</div> : <></>}
      {errorUpdate ? <div className="notification is-danger">{errorUpdate?.message}</div> : <></>}
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
                value={receiver}
                autoComplete="on"
                placeholder={t('name')}
                onChange={(e) => {
                  e.preventDefault();
                  setReceiver(e.currentTarget.value);
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
                value={sender}
                autoComplete="on"
                placeholder={t('name')}
                onChange={(e) => {
                  e.preventDefault();
                  setSender(e.currentTarget.value);
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
                value={dayjs(time).format("YYYY-MM-DDTHH:mm")}
                type="datetime-local"
                placeholder={dayjs(Date.now()).format("DD.MM.YYYY HH:mm")}
                onChange={(e) => {
                  e.preventDefault();
                  e.currentTarget.value && setTime(dayjs(e.currentTarget.value).toDate());
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
                value={content}
                onChange={(e) => {
                  e.preventDefault();
                  setContent(e.currentTarget.value);
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
              <button className="button is-primary is-rounded" onClick={() => handleSave()}>
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      </div>
      {content !== "" || sender !== "" || receiver !== "" ? (
        <>
          <div className="title is-size-4 is-capitalized">{t('preview')}</div>
          <JournalMessage
            id={undefined}
            message={content}
            receiver={receiver}
            sender={sender}
            timeDate={time || new Date()}
            priority={messageToEdit?.priority.name || PriorityStatus.Normal}
            triage={messageToEdit?.triage.name || TriageStatus.Pending}
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
