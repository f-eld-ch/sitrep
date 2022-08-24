import { faCircleArrowLeft, faCircleArrowRight, faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import dayjs from "dayjs";
import { t } from "i18next";
import { Hint } from 'react-autocomplete-hint';
import { useEditorContext } from "../Editor";

export function Radio() {

    const { state, dispatch } = useEditorContext();

    return (
        <div>
            <div className="field is-horizontal">
                <div className="field-label is-normal">
                    <label className="label is-capitalized">{t('message.receiver')}</label>
                </div>
                <div className="field-body">
                    <div className="field">
                        <div className="control is-expanded has-icons-left">
                            <Hint options={state.autocompleteDetails.senderReceiverNames} allowTabFill={true} allowEnterFill={true} >
                                <input
                                    className="input"
                                    type="text"
                                    value={state.receiver}
                                    autoComplete="on"
                                    placeholder={t('name')}
                                    onChange={(e) => {
                                        e.preventDefault();
                                        dispatch({ type: 'set_receiver', receiver: e.target.value });
                                    }}
                                />
                            </Hint>
                            <span className="icon is-small is-left">
                                <FontAwesomeIcon icon={faCircleArrowRight} />
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="field is-horizontal">
                <div className="field-label is-normal">
                    <label className="label is-capitalized">{t('message.sender')}</label>
                </div>
                <div className="field-body">
                    <div className="field">
                        <div className="control is-expanded has-icons-left">
                            <Hint options={state.autocompleteDetails.senderReceiverNames} allowTabFill={true} allowEnterFill={true} >
                                <input
                                    className="input"
                                    type="text"
                                    value={state.sender}
                                    autoComplete="on"
                                    placeholder={t('name')}
                                    onChange={(e) => {
                                        e.preventDefault();
                                        dispatch({ type: 'set_sender', sender: e.target.value });
                                    }}
                                />
                            </Hint>
                            <span className="icon is-small is-left">
                                <FontAwesomeIcon icon={faCircleArrowLeft} />
                            </span>
                        </div>
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
                                    e.target.value && dispatch({ type: 'set_time', time: dayjs(e.target.value).toDate() });
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
                                    dispatch({ type: 'set_content', content: e.target.value });
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
                            <button className="button is-primary is-rounded is-capitalized" onClick={(e) => {
                                e.preventDefault();
                                dispatch({ type: 'save' })
                            }}>
                                {t('save')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}