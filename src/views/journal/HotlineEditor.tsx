import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faPhone, faUser } from '@fortawesome/free-solid-svg-icons';

function List() {
  
  return (
    <>
      <h3 className="title is-size-3">Hotline</h3>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
            <label className="label">Name Anrufer</label>
        </div>
        <div className="field-body">
            <div className="field">
                <p className="control is-expanded has-icons-left">
                    <input className="input" type="text" placeholder="Name" />
                    <span className="icon is-small is-left">
                        <FontAwesomeIcon icon={faUser} />
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
                        <FontAwesomeIcon icon={faPhone} />
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
                        <FontAwesomeIcon icon={faClock} />
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
      <div className="field-label">
      </div>
      <div className="field-body">
          <div className="field">
            <div className="control">
                <button className="button is-primary">
                Send message
                </button>
            </div>
          </div>
      </div>
    </div>
      </>
  );
}

export default List;
