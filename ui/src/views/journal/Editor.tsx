import { useMutation, useQuery } from "@apollo/client/react";
import { useTranslation } from "react-i18next";
import uniq from "lodash/uniq";
import React, { useCallback, useId, useMemo, useReducer, useRef } from "react";
import { useBlocker, useNavigate, useParams } from "react-router";
import type { GetJournalMessagesData, GetJournalMessagesVars } from "types";
import { Medium, type Message, PriorityStatus, TriageStatus } from "types";
import type { UpdateMessageVars } from "types/journal";
import Notification from "utils/Notification";
import useDebounce from "utils/useDebounce";
import { MediumForm, RadioChannelDetailInput } from "./EditorForms";
import { GetJournalMessages, InsertMessage, UpdateMessage } from "./graphql";
import { default as List } from "./List";
import { default as JournalMessage } from "./Message";
import TriageModal from "./TriageModal";
import {
  type AutofillDetail,
  EditorContext,
  type EditorContextValue,
  type MediaDetail,
  editorReducer,
  initEditorState,
  isNonEmptyString,
  useEditorContext,
} from "./editorState";

// re-export types that Elements.tsx / sub-forms depend on via this path
export type { PhoneDetail, EmailDetail, OtherDetail, RadioDetail } from "./editorState";
export { useEditorContext } from "./editorState";
export { ReactEditor, ReactPreview } from "./Markdown";

function Editor() {
  const { t } = useTranslation();
  const { journalId } = useParams();
  const { data } = useQuery<GetJournalMessagesData, GetJournalMessagesVars>(GetJournalMessages, {
    fetchPolicy: "cache-first",
    variables: { journalId: journalId || "" },
  });

  const [state, dispatch] = useReducer(editorReducer, initEditorState());

  const savingRef = useRef(false);

  const isDirty =
    state.content !== "" ||
    state.sender !== "" ||
    state.receiver !== "" ||
    state.radioChannel !== "" ||
    state.senderDetail !== "" ||
    state.receiverDetail !== "" ||
    state.time !== undefined ||
    state.messageToEdit !== undefined;

  const blocker = useBlocker(isDirty);

  const [insertMessage, { error, loading: insertLoading }] = useMutation(InsertMessage, {
    onCompleted() {
      savingRef.current = false;
      if (blocker.state === "blocked") blocker.reset();
      dispatch({ type: "clear" });
    },
    onError() {
      savingRef.current = false;
    },
    refetchQueries: [{ query: GetJournalMessages, variables: { journalId } }],
  });

  const [updateMessage, { error: errorUpdate, loading: updateLoading }] = useMutation<
    Message,
    UpdateMessageVars
  >(UpdateMessage, {
    onCompleted() {
      savingRef.current = false;
      if (blocker.state === "blocked") blocker.reset();
      dispatch({ type: "clear" });
    },
    onError() {
      savingRef.current = false;
    },
    refetchQueries: [{ query: GetJournalMessages, variables: { journalId } }],
  });

  const autocompleteDetails = useMemo<AutofillDetail>(
    () => ({
      senderReceiverNames: uniq(data?.messages.flatMap((d) => [d.sender, d.receiver])).filter(
        isNonEmptyString,
      ),
      senderReceiverDetails: uniq(
        data?.messages
          .filter((d) => d.medium !== Medium.Radio)
          .flatMap((d) => [d.senderDetail, d.receiverDetail]),
      ).filter(isNonEmptyString),
      channelList: uniq(
        data?.messages.filter((d) => d.medium === Medium.Radio).map((d) => d.senderDetail),
      ).filter(isNonEmptyString),
    }),
    [data],
  );

  const saving = insertLoading || updateLoading;

  const handleSave = useCallback(() => {
    if (journalId === undefined) return;
    if (savingRef.current) return;
    savingRef.current = true;
    const time = state.time ?? new Date();
    const senderDetail = state.media !== Medium.Radio ? state.senderDetail : state.radioChannel;
    const receiverDetail = state.media !== Medium.Radio ? state.receiverDetail : state.radioChannel;
    if (state.messageToEdit?.id) {
      updateMessage({
        variables: {
          messageId: state.messageToEdit.id,
          time,
          journalId,
          content: state.content,
          medium: state.media,
          sender: state.sender,
          senderDetail,
          receiver: state.receiver,
          receiverDetail,
        },
      });
    } else {
      insertMessage({
        variables: {
          time,
          journalId,
          content: state.content,
          medium: state.media,
          sender: state.sender,
          senderDetail,
          receiver: state.receiver,
          receiverDetail,
        },
      });
    }
  }, [state, insertMessage, updateMessage, journalId]);

  const setEditorMessage = useCallback((message: Message | undefined) => {
    if (message) {
      dispatch({ type: "set_edit_message", message });
    } else {
      dispatch({ type: "clear" });
    }
  }, []);

  const setTriageMessage = useCallback(
    (message: Message | undefined) => dispatch({ type: "set_triage_message", message }),
    [],
  );

  const contextValue: EditorContextValue = {
    state,
    dispatch,
    onSave: handleSave,
    saving,
    autocompleteDetails,
  };

  return (
    <EditorContext.Provider value={contextValue}>
      <div>
        <div className="columns is-tablet">
          <div className="column is-half">
            <h3 className="title is-3 is-capitalized">{t("editor")}</h3>
            {blocker.state === "blocked" && (
              <div className="notification is-danger is-light">
                <button
                  className="delete is-pulled-right is-small mb-2"
                  aria-label={t("cancel") as string}
                  onClick={() => blocker.reset()}
                />
                <p className="mb-2">{t("unsavedChanges")}</p>
                <button
                  type="button"
                  className="button is-primary"
                  onClick={() => blocker.proceed()}
                >
                  {t("discard")}
                </button>
              </div>
            )}
            {error && <Notification type="error">{error?.message}</Notification>}
            {errorUpdate && <Notification type="error">{errorUpdate?.message}</Notification>}
            <InputBox />
          </div>
          <div className="column is-half">
            <List
              showControls={true}
              setEditorMessage={setEditorMessage}
              setTriageMessage={setTriageMessage}
            />
          </div>
          <TriageModal
            message={state.messageToTriage}
            setMessage={(message: Message | undefined) =>
              dispatch({ type: "set_triage_message", message })
            }
          />
        </div>
      </div>
    </EditorContext.Provider>
  );
}

function InputBox() {
  const { t } = useTranslation();
  const { incidentId, journalId } = useParams();
  const { state, dispatch, onSave } = useEditorContext();

  const messageContentDebounced: string = useDebounce(state.content, 250);

  const handleMediumChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectMedium = e.target.value;
    if (
      selectMedium === Medium.Radio ||
      selectMedium === Medium.Email ||
      selectMedium === Medium.Phone ||
      selectMedium === Medium.Other
    ) {
      dispatch({ type: "set_media_detail", detail: { type: selectMedium } as MediaDetail });
    }
  };

  const navigate = useNavigate();

  const message: Message = {
    id: state.messageToEdit?.id || "",
    content: messageContentDebounced,
    sender: state.sender,
    senderDetail: state.senderDetail,
    receiver: state.receiver,
    receiverDetail: state.receiverDetail,
    medium: state.media,
    createdAt: state.messageToEdit?.createdAt || new Date(),
    updatedAt: state.messageToEdit?.updatedAt || new Date(),
    divisions: state.messageToEdit?.divisions || [],
    deletedAt: state.messageToEdit?.deletedAt || new Date(),
    time: state.time || new Date(),
    priorityId: state.messageToEdit?.priorityId || PriorityStatus.Normal,
    triageId: state.messageToEdit?.triageId || TriageStatus.Pending,
  };

  const mediumId = useId();
  return (
    <div className="box">
      <button
        type="button"
        className="delete is-pulled-right is-small mb-2"
        aria-label={t("close")}
        onClick={() => navigate(`/incident/${incidentId}/journal/${journalId}`)}
      />

      <div className="mt-5 field is-horizontal">
        <div className="field-label is-normal is-flex-shrink-0">
          <label htmlFor={mediumId} className="label is-capitalized">
            {t("mediumName")}
          </label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-grouped-multiline">
            <div className="control is-normal is-flex-shrink-2 is-flex-wrap-wrap">
              <div className="select is-fullwidth">
                <select id={mediumId} value={state.media} onChange={handleMediumChange}>
                  {Object.values(Medium).map((medium: Medium) => (
                    <option
                      key={medium}
                      label={t([`medium.${medium}`, `medium.${Medium.Other}`]) as string}
                    >
                      {medium}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {state.media === Medium.Radio && <RadioChannelDetailInput />}
          </div>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        noValidate
      >
        <MediumForm medium={state.media} />
      </form>
      {(state.content !== "" || state.sender !== "" || state.receiver !== "") && (
        <>
          <div className="title is-size-4 is-capitalized">{t("preview")}</div>
          <JournalMessage
            id={undefined}
            message={message}
            showControls={false}
            divisions={[]}
            setEditorMessage={undefined}
            setTriageMessage={undefined}
          />
        </>
      )}
    </div>
  );
}

export default Editor;
