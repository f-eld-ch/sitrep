import {
  faCircleArrowLeft,
  faCircleArrowRight,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import dayjs from "dayjs";
import { t } from "i18next";
import { Hint } from "react-autocomplete-hint";
import { Medium } from "types";
import { useEditorContext } from "../Editor";
import { useId } from "react";

const SenderInput = () => {
  const { state, dispatch } = useEditorContext();

  const id = useId();
  return (
    <div className="control is-expanded has-icons-left is-flex-shrink-1">
      <Hint
        options={state.autocompleteDetails.senderReceiverNames}
        allowTabFill={true}
        allowEnterFill={true}
      >
        <input
          id={id}
          className="input"
          type="text"
          value={state.sender}
          autoComplete="on"
          placeholder={t("name") as string}
          onChange={(e) => {
            e.preventDefault();
            dispatch({ type: "set_sender", sender: e.target.value });
          }}
        />
      </Hint>
      <span className="icon is-small is-left">
        <FontAwesomeIcon icon={faCircleArrowLeft} />
      </span>
    </div>
  );
};

const ReceiverInput = () => {
  const { state, dispatch } = useEditorContext();
  const id = useId();

  return (
    <div className="control is-expanded has-icons-left is-flex-shrink-1">
      <Hint
        options={state.autocompleteDetails.senderReceiverNames}
        allowTabFill={true}
        allowEnterFill={true}
      >
        <input
          id={id}
          className="input"
          type="text"
          value={state.receiver}
          autoComplete="on"
          placeholder={t("name") as string}
          onChange={(e) => {
            e.preventDefault();
            dispatch({ type: "set_receiver", receiver: e.target.value });
          }}
        />
      </Hint>
      <span className="icon is-small is-left">
        <FontAwesomeIcon icon={faCircleArrowRight} />
      </span>
    </div>
  );
};

const ContentInput = () => {
  const { state, dispatch } = useEditorContext();
  const id = useId();
  return (
    <div className="control">
      <textarea
        id={id}
        className="textarea"
        placeholder={t("message.contentHelp") as string}
        rows={10}
        value={state.content}
        onChange={(e) => {
          e.preventDefault();
          dispatch({ type: "set_content", content: e.target.value });
        }}
      />
    </div>
  );
};

const TimeInput = () => {
  const { state, dispatch } = useEditorContext();
  const id = useId();
  return (
    <div className="control is-expanded has-icons-left is-flex-shrink-1">
      <input
        id={id}
        className="input"
        value={dayjs(state.time).format("YYYY-MM-DDTHH:mm")}
        type="datetime-local"
        placeholder={dayjs(Date.now()).format("DD.MM.YYYY HH:mm")}
        onChange={(e) => {
          e.preventDefault();
          dispatch({ type: "set_time", time: dayjs(e.target.value).toDate() });
        }}
      />
      <span className="icon is-small is-left">
        <FontAwesomeIcon icon={faClock} />
      </span>
    </div>
  );
};

const SenderDetailInput = (props: { placeholder: string }) => {
  const { state, dispatch } = useEditorContext();
  const id = useId();
  return (
    <div className="control is-expanded is-flex-shrink-3">
      <Hint
        options={state.autocompleteDetails.senderReceiverDetails}
        allowTabFill={true}
        allowEnterFill={true}
      >
        <input
          id={id}
          className="input"
          value={state.senderDetail}
          type="text"
          onChange={(e) => {
            e.preventDefault();
            dispatch({
              type: "set_media_detail",
              detail: Object.assign({}, state.media, {
                type: state.media,
                sender: e.target.value,
              }),
            });
          }}
          placeholder={props.placeholder}
        />
      </Hint>
    </div>
  );
};

const ReceiverDetailInput = (props: { placeholder: string }) => {
  const { state, dispatch } = useEditorContext();
  const id = useId();
  return (
    <div className="control is-expanded is-flex-shrink-3">
      <Hint
        options={state.autocompleteDetails.senderReceiverDetails}
        allowTabFill={true}
        allowEnterFill={true}
      >
        <input
          id={id}
          className="input"
          value={state.receiverDetail}
          type="text"
          onChange={(e) => {
            e.preventDefault();
            dispatch({
              type: "set_media_detail",
              detail: Object.assign({}, state.media, {
                type: state.media,
                receiver: e.target.value,
              }),
            });
          }}
          placeholder={props.placeholder}
        />
      </Hint>
    </div>
  );
};

const RadioChannelDetailInput = () => {
  const { state, dispatch } = useEditorContext();
  const id = useId();
  return (
    <div className="control is-narrow is-flex-shrink-4">
      <Hint
        options={state.autocompleteDetails.channelList}
        allowTabFill={true}
        allowEnterFill={true}
      >
        <input
          id={id}
          className="input"
          value={state.radioChannel || ""}
          type="text"
          onChange={(e) => {
            e.preventDefault();
            dispatch({
              type: "set_media_detail",
              detail: { type: Medium.Radio, channel: e.target.value },
            });
          }}
          placeholder={t("radioChannel") as string}
        />
      </Hint>
    </div>
  );
};

const SaveButton = () => {
  const { state, dispatch } = useEditorContext();
  return (
    <div className="control">
      <button
        type="submit"
        className="button is-primary is-rounded is-capitalized"
        onClick={(e) => {
          e.preventDefault();
          dispatch({ type: "save" });
        }}
        disabled={
          state.content === "" || state.sender === "" || state.receiver === ""
        }
      >
        {t("save")}
      </button>
    </div>
  );
};
export {
  SenderInput,
  SenderDetailInput,
  ReceiverInput,
  ReceiverDetailInput,
  TimeInput,
  ContentInput,
  RadioChannelDetailInput,
  SaveButton,
};
