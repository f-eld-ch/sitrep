import React from 'react';

import {JournalMessage} from 'components';
import {MessageStatus as Status} from 'types';

import dayjs from "dayjs";
import relativeTime from 'dayjs/plugin/relativeTime';
import classNames from 'classnames';


// FIXME(daa): remove
import faker from "faker/locale/de";
import _ from 'lodash';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faClock, faEnvelope, faUser } from '@fortawesome/free-solid-svg-icons';
const getRandomStatus = () => { return _.sample(Object.values(Status)) as Status }

// FIXME(daa): remove
const ASSIGNMENTS = ["Pol", "Lage", "San", "FW", "Tech"]


function Editor() {
    let status = Status.New;
    let sender = "foobar";
    let receiver = "foobarbaz";
    let message = "adsfasd fasdf asdf asdfsf"
    let timeDate = new Date();

    let dayTime = dayjs(timeDate).subtract(4, "minutes");
   
    let messageClassNames = classNames({
        message: true,
        'is-warning': status == Status.New,
        // 'is-danger': status == Status.Important,
        // 'is-dark': status == Status.Triaged,
    });


    return (
        <div>
            <div className="columns">
                <div className="column is-half">
                    <h3 className="title is-3">Editor</h3>

                    <InputBox />
                </div>
                <div className="column is-half">
                    <h3 className="title is-3">Journal-Log</h3>
                    { _.times(faker.random.number(20), () => 
                            { 
                                return <JournalMessage assignments={ASSIGNMENTS.slice(0,faker.random.number(ASSIGNMENTS.length))} status={getRandomStatus()} sender={faker.name.findName()} receiver={faker.name.findName()} message={faker.lorem.paragraphs(2)}  timeDate={faker.date.recent(1)}/>
                            }
                        )
                    }
                </div> 
            </div>
        </div>
    );
}

function InputBox() {
    return (
        <div className="box" >
            <div className="field is-horizontal">
                <div className="field-label is-normal">
                    <label className="label">Empfänger</label>
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
                    <label className="label">Sender</label>
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
                    <label className="label">Medium</label>
                </div>
                <div className="field-body">
                    <div className="field is-narrow">
                    <div className="control">
                        <div className="select is-fullwidth">
                        <select>
                            <option>Funk</option>
                            <option>Telefon</option>
                            <option>Email</option>
                        </select>
                        </div>
                    </div>
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
                            <input className="input" type="text" placeholder="Name" />
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
                <div className="field-label is-normal">
                    <label className="label">Status</label>
                </div>
                <div className="field-body">
                    <div className="field is-narrow">
                    <div className="control">
                        <div className="select is-fullwidth">
                        <select>
                            <option>{Status.New}</option>
                            <option>{Status.Triaged}</option>
                            <option>{Status.Important}</option>
                        </select>
                        </div>
                    </div>
                    </div>
                </div>
            </div>

            <div className="field is-horizontal">
                <div className="field-label is-normal">
                    <label className="label">Fachbereiche</label>
                </div>
                <div className="field-body">
                    <div className="field is-narrow">
                    <div className="control">
                        <div className="select is-multiple">
                        <select>
                            {ASSIGNMENTS.map(a => {return <option>{a}</option>})}
                        </select>
                        </div>
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
        </div>
    );
}

export default Editor;
