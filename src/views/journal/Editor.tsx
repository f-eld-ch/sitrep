import React, { useState } from "react";

import List from "./List";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faUser } from "@fortawesome/free-solid-svg-icons";
import { IconProp } from "@fortawesome/fontawesome-svg-core";

import { Link, useParams } from "react-router-dom";
import dayjs from "dayjs";
import Message from "components/JournalMessage";
import { PriorityStatus, TriageStatus } from "types";
import { gql, useMutation } from "@apollo/client";

function Editor() {
  return (
    <div>
      <div className="columns">
        <div className="column is-half">
          <h3 className="title is-3">Editor</h3>
          <InputBox />
        </div>
        <div className="column">
          <List showControls={true} />
        </div>
      </div>
    </div>
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

function RadioInput() {
  const { journalId } = useParams();
  const [sender, setSender] = useState("");
  const [receiver, setReceiver] = useState("");
  const [content, setContent] = useState("");
  const [time, setTime] = useState(new Date());

  const [insertMessage, { error }] = useMutation(INSERT_MESSAGE, {
    onCompleted(data) {
      // reset the form values
      setSender("");
      setReceiver("");
      setContent("");
      setTime(new Date());
    },
    // refetchQueries: [{ query: SUBSCRIBE_MESSAGES }, "GetMessages"],
  });

  const handleSave = () => {
    insertMessage({
      variables: {
        time: time,
        journalId: journalId,
        content: content,
        sender: sender,
        receiver: receiver,
      },
    });
  };

  return (
    <div>
      {error ? <div className="notification is-danger">{error?.message}</div> : <></>}
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label">Empfänger</label>
        </div>
        <div className="field-body">
          <div className="field">
            <p className="control is-expanded has-icons-left">
              <input
                className="input"
                type="text"
                value={receiver}
                placeholder="Name"
                onChange={(e) => {
                  e.preventDefault();
                  setReceiver(e.currentTarget.value);
                }}
              />
              <span className="icon is-small is-left">
                <FontAwesomeIcon icon={faUser as IconProp} />
              </span>
            </p>
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label">Sender</label>
        </div>
        <div className="field-body">
          <div className="field">
            <p className="control is-expanded has-icons-left">
              <input
                className="input"
                type="text"
                value={sender}
                placeholder="Name"
                onChange={(e) => {
                  e.preventDefault();
                  setSender(e.currentTarget.value);
                }}
              />
              <span className="icon is-small is-left">
                <FontAwesomeIcon icon={faUser as IconProp} />
              </span>
            </p>
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label">Zeit</label>
        </div>
        <div className="field-body">
          <div className="field">
            <p className="control is-expanded has-icons-left">
              <input
                className="input"
                value={time.toISOString()}
                type="datetime-local"
                placeholder={dayjs(Date.now()).format("DD.MM.YYYY HH:mm")}
                onChange={(e) => {
                  e.preventDefault();
                  console.log("got date:" + e.currentTarget.value);
                  e.currentTarget.value && setTime(dayjs(e.currentTarget.value).toDate());
                }}
              />
              <span className="icon is-small is-left">
                <FontAwesomeIcon icon={faClock as IconProp} />
              </span>
            </p>
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label">Nachricht</label>
        </div>
        <div className="field-body">
          <div className="field">
            <div className="control">
              <textarea
                className="textarea"
                autoFocus={true}
                placeholder="Was wurde übermittelt?"
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
              <button className="button is-primary" onClick={() => handleSave()}>
                Speichern
              </button>
            </div>
          </div>
        </div>
      </div>
      {content !== "" || sender !== "" || receiver !== "" ? (
        <>
          <div className="title is-size-4">Vorschau</div>
          <Message
            message={content}
            receiver={receiver}
            sender={sender}
            timeDate={time}
            priority={PriorityStatus.Normal}
            triage={TriageStatus.Pending}
            showControls={false}
          />
        </>
      ) : (
        <></>
      )}
    </div>
  );
}

export default Editor;
