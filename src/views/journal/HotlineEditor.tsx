import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faPhone, faUser } from "@fortawesome/free-solid-svg-icons";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import List from "./List";

function HotlineEditor() {
  return (
    <div>
      <div className="columns">
        <div className="column is-half">
          <h3 className="title is-3">Hotline</h3>
          <Hotline />
        </div>
        <div className="column">
          <List showControls={false} />
        </div>
      </div>
    </div>
  );
}

function Hotline() {
  return (
    <>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label">Name Anrufer</label>
        </div>
        <div className="field-body">
          <div className="field">
            <p className="control is-expanded has-icons-left">
              <input className="input" type="text" placeholder="Name" />
              <span className="icon is-small is-left">
                <FontAwesomeIcon icon={faUser as IconProp} />
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label">Telefonnummer</label>
        </div>
        <div className="field-body">
          <div className="field">
            <p className="control is-expanded has-icons-left">
              <input className="input" type="tel" placeholder="Telefonnummer" />
              <span className="icon is-small is-left">
                <FontAwesomeIcon icon={faPhone as IconProp} />
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
              <input className="input" type="text" placeholder="Zeit" />
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
              <textarea className="textarea" placeholder="Was wurde übermittelt?" rows={10} />
            </div>
          </div>
        </div>
      </div>

      <div className="field is-horizontal">
        <div className="field-label"></div>
        <div className="field-body">
          <div className="field">
            <div className="control">
              <button className="button is-primary">Send message</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default HotlineEditor;
