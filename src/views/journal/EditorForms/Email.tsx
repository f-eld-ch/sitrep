import { faCircleArrowLeft, faCircleArrowRight, faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import dayjs from "dayjs";
import { t } from "i18next";
import { Medium, PriorityStatus, TriageStatus } from "types";
import { useEditorContext } from "../Editor";
import { default as JournalMessage } from '../Message';

export function Email() {

    const { state, dispatch } = useEditorContext();

    return (
        <div>
            <div className="field is-horizontal">
                <div className="field-label is-normal">
                    <label className="label is-capitalized">{t('email.sender')}</label>
                </div>
                <div className="field-body">
                    <div className="field is-grouped is-grouped-multiline">
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
                        <p className="control is-expanded">
                            <input
                                className="input"
                                value={state.media?.type === Medium.Email ? state.media?.sender : ""}
                                type="email"
                                onChange={(e) => {
                                    e.preventDefault();
                                    dispatch({ type: 'set_media_detail', detail: { type: Medium.Email, sender: e.currentTarget.value } });
                                }}
                                placeholder={t('emailAddress')}
                            />
                        </p>
                    </div>
                </div>
            </div>
            <div className="field is-horizontal">
                <div className="field-label is-normal">
                    <label className="label is-capitalized">{t('email.receiver')}</label>
                </div>
                <div className="field-body">
                    <div className="field is-grouped is-grouped-multiline">
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
                        <p className="control is-expanded">
                            <input
                                className="input"
                                value={state.media?.type === Medium.Email ? state.media?.receiver : ""}
                                type="email"
                                onChange={(e) => {
                                    e.preventDefault();
                                    dispatch({ type: 'set_media_detail', detail: { type: Medium.Email, receiver: e.currentTarget.value } });
                                }}
                                placeholder={t('emailAddress')}
                            />
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
            {state.content !== "" || state.sender !== "" || state.receiver !== "" ? (
                <>
                    <div className="title is-size-4 is-capitalized">{t('preview')}</div>
                    <JournalMessage
                        id={undefined}
                        message={state.content}
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
        </div>
    );
}