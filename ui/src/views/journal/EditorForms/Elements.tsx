import { faCircleArrowLeft, faCircleArrowRight, faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import dayjs from "dayjs";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Hint } from "react-autocomplete-hint";
import { Medium } from "types";
import { useDate } from "utils/useDate";
import { ReactEditor } from "../Markdown";
import { canSave, useEditorContext } from "../editorState";

type NonRadioMedium = Exclude<Medium, Medium.Radio>;

const SenderInput = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const { state, dispatch, autocompleteDetails } = useEditorContext();

  return (
    <div className="control is-expanded has-icons-left is-flex-shrink-1">
      <Hint
        options={autocompleteDetails.senderReceiverNames}
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

const ReceiverInput = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const { state, dispatch, autocompleteDetails } = useEditorContext();

  return (
    <div className="control is-expanded has-icons-left is-flex-shrink-1">
      <Hint
        options={autocompleteDetails.senderReceiverNames}
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

const ContentInput = ({ id }: { id: string }) => {
  return (
    <div className="control">
      <ReactEditor id={id} />
    </div>
  );
};

const TimeInput = ({ id }: { id: string }) => {
  const { state, dispatch } = useEditorContext();
  const { now } = useDate();
  return (
    <div className="control is-expanded has-icons-left is-flex-shrink-1">
      <input
        id={id}
        className="input"
        value={dayjs(state.time ?? now).format("YYYY-MM-DDTHH:mm")}
        type="datetime-local"
        onChange={(e) => {
          dispatch({
            type: "set_time",
            time: e.target.value ? dayjs(e.target.value).toDate() : undefined,
          });
        }}
      />
      <span className="icon is-small is-left">
        <FontAwesomeIcon icon={faClock} />
      </span>
    </div>
  );
};

const SenderDetailInput = ({
  placeholder,
  medium,
}: {
  placeholder: string;
  medium: NonRadioMedium;
}) => {
  const { state, dispatch, autocompleteDetails } = useEditorContext();
  const id = useId();
  return (
    <div className="control is-expanded is-flex-shrink-3">
      <Hint
        options={autocompleteDetails.senderReceiverDetails}
        allowTabFill={true}
        allowEnterFill={true}
      >
        <input
          id={id}
          aria-label={placeholder}
          className="input"
          value={state.senderDetail}
          type="text"
          onChange={(e) => {
            dispatch({
              type: "set_media_detail",
              detail: { type: medium, sender: e.target.value },
            });
          }}
          placeholder={placeholder}
        />
      </Hint>
    </div>
  );
};

const ReceiverDetailInput = ({
  placeholder,
  medium,
}: {
  placeholder: string;
  medium: NonRadioMedium;
}) => {
  const { state, dispatch, autocompleteDetails } = useEditorContext();
  const id = useId();
  return (
    <div className="control is-expanded is-flex-shrink-3">
      <Hint
        options={autocompleteDetails.senderReceiverDetails}
        allowTabFill={true}
        allowEnterFill={true}
      >
        <input
          id={id}
          aria-label={placeholder}
          className="input"
          value={state.receiverDetail}
          type="text"
          onChange={(e) => {
            dispatch({
              type: "set_media_detail",
              detail: { type: medium, receiver: e.target.value },
            });
          }}
          placeholder={placeholder}
        />
      </Hint>
    </div>
  );
};

const RadioChannelDetailInput = () => {
  const { t } = useTranslation();
  const { state, dispatch, autocompleteDetails } = useEditorContext();
  const id = useId();
  return (
    <div className="control is-narrow is-flex-shrink-4">
      <Hint options={autocompleteDetails.channelList} allowTabFill={true} allowEnterFill={true}>
        <input
          id={id}
          aria-label={t("radioChannel") as string}
          className="input"
          value={state.radioChannel || ""}
          type="text"
          onChange={(e) => {
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
  const { t } = useTranslation();
  const { state, saving } = useEditorContext();
  return (
    <div className="control">
      <button
        type="submit"
        className="button is-primary is-rounded is-capitalized"
        disabled={!canSave(state) || saving}
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
