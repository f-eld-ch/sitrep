import { faCircleArrowLeft, faCircleArrowRight, faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import dayjs from "dayjs";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Hint } from "react-autocomplete-hint";
import { Medium } from "types";
import { useDate } from "utils/useDate";
import { Button } from "components/ui";
import { ReactEditor } from "../Markdown";
import { canSave, hasValidMessageTime, useEditorContext } from "../editorState";

type NonRadioMedium = Exclude<Medium, Medium.Radio>;

const inputBase =
  "w-full rounded border border-border px-3 py-1.5 text-sm bg-bg text-fg focus:outline-none focus:ring-1 focus:ring-primary";
const inputWithIcon =
  "w-full rounded border border-border pl-10 pr-3 py-1.5 text-sm bg-bg text-fg focus:outline-none focus:ring-1 focus:ring-primary";
const iconSpan =
  "absolute inset-y-0 left-0 w-10 flex items-center justify-center text-fg-muted/50 pointer-events-none text-sm";

const SenderInput = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const { state, dispatch, autocompleteDetails } = useEditorContext();

  return (
    <div className="relative flex-1 min-w-0">
      <Hint
        options={autocompleteDetails.senderReceiverNames}
        allowTabFill={true}
        allowEnterFill={true}
      >
        <input
          id={id}
          className={inputWithIcon}
          type="text"
          value={state.sender}
          autoComplete="on"
          placeholder={t("name") as string}
          onChange={(e) => {
            dispatch({ type: "set_sender", sender: e.target.value });
          }}
        />
      </Hint>
      <span className={iconSpan}>
        <FontAwesomeIcon icon={faCircleArrowLeft} />
      </span>
    </div>
  );
};

const ReceiverInput = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const { state, dispatch, autocompleteDetails } = useEditorContext();

  return (
    <div className="relative flex-1 min-w-0">
      <Hint
        options={autocompleteDetails.senderReceiverNames}
        allowTabFill={true}
        allowEnterFill={true}
      >
        <input
          id={id}
          className={inputWithIcon}
          type="text"
          value={state.receiver}
          autoComplete="on"
          placeholder={t("name") as string}
          onChange={(e) => {
            dispatch({ type: "set_receiver", receiver: e.target.value });
          }}
        />
      </Hint>
      <span className={iconSpan}>
        <FontAwesomeIcon icon={faCircleArrowRight} />
      </span>
    </div>
  );
};

const ContentInput = ({ id }: { id: string }) => {
  return (
    <div>
      <ReactEditor id={id} />
    </div>
  );
};

const TimeInput = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const { state, dispatch } = useEditorContext();
  const { now } = useDate();
  const invalidTime = !hasValidMessageTime(state.time, now);
  return (
    <div className="flex-1 min-w-0">
      <div className="relative">
        <input
          id={id}
          className={inputWithIcon}
          value={dayjs(state.time ?? now).format("YYYY-MM-DDTHH:mm")}
          type="datetime-local"
          max={dayjs(now).add(5, "minute").format("YYYY-MM-DDTHH:mm")}
          aria-invalid={invalidTime}
          aria-describedby={invalidTime ? `${id}-error` : undefined}
          onChange={(e) => {
            dispatch({
              type: "set_time",
              time: e.target.value ? dayjs(e.target.value).toDate() : undefined,
            });
          }}
        />
        <span className={iconSpan}>
          <FontAwesomeIcon icon={faClock} />
        </span>
      </div>
      {invalidTime && (
        <p id={`${id}-error`} className="text-xs text-danger mt-1" role="alert">
          {t("messageTimeTooFarInFuture")}
        </p>
      )}
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
    <div className="flex-1 min-w-0">
      <Hint
        options={autocompleteDetails.senderReceiverDetails}
        allowTabFill={true}
        allowEnterFill={true}
      >
        <input
          id={id}
          aria-label={placeholder}
          className={inputBase}
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
    <div className="flex-1 min-w-0">
      <Hint
        options={autocompleteDetails.senderReceiverDetails}
        allowTabFill={true}
        allowEnterFill={true}
      >
        <input
          id={id}
          aria-label={placeholder}
          className={inputBase}
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
    <div className="w-32 shrink-0">
      <Hint options={autocompleteDetails.channelList} allowTabFill={true} allowEnterFill={true}>
        <input
          id={id}
          aria-label={t("radioChannel") as string}
          className={inputBase}
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
    <Button
      type="submit"
      variant="primary"
      disabled={!canSave(state) || saving}
    >
      {t("save")}
    </Button>
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
