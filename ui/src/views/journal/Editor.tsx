import { useTranslation } from "react-i18next";
import { faPaperclip, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import uniq from "lodash/uniq";
import React, {
  useCallback,
  useContext,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useDropzone } from "react-dropzone";
import { Navigate, useBlocker, useNavigate, useParams } from "react-router";
import { Medium, type Message, PriorityStatus, TriageStatus } from "types";
import { Spinner } from "components";
import Notification from "utils/Notification";
import useDebounce from "utils/useDebounce";
import {
  useCreateMessage,
  useIncidentMessages,
  useRemoveAttachment,
  useUpdateMessage,
  useUploadAttachment,
} from "api";
import { IncidentContext } from "utils";
import { MediumForm, RadioChannelDetailInput } from "./EditorForms";
import { FormRow } from "./EditorForms/FormRow";
import { default as List } from "./List";
import { default as JournalMessage } from "./Message";
import TriageModal from "./TriageModal";
import {
  type AutofillDetail,
  EditorContext,
  type EditorContextValue,
  type MediaDetail,
  canSave,
  editorReducer,
  initEditorState,
  isNonEmptyString,
  useEditorContext,
} from "./editorState";

// re-export types that Elements.tsx / sub-forms depend on via this path
export type { PhoneDetail, EmailDetail, OtherDetail, RadioDetail } from "./editorState";
export { useEditorContext } from "./editorState";
export { ReactEditor, ReactPreview } from "./Markdown";

const EMPTY_MESSAGES: Message[] = [];

function Editor() {
  const { t } = useTranslation();
  const { incidentId } = useParams();
  const {
    state: { incident, loadedForId },
  } = useContext(IncidentContext);
  const messagesResult = useIncidentMessages(incidentId ?? "");
  const [createMessage, createState] = useCreateMessage();
  const [updateMessage, updateState] = useUpdateMessage();
  const [uploadAttachment] = useUploadAttachment();
  const [state, dispatch] = useReducer(editorReducer, initEditorState());
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const savingRef = useRef(false);

  const addPendingFile = useCallback((file: File) => {
    setPendingFiles((prev) => [...prev, file]);
  }, []);

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);
  const incidentIsClosed = incident?.closedAt != null;

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

  const messages =
    messagesResult.status === "ready" ? messagesResult.data.messages : EMPTY_MESSAGES;

  const autocompleteDetails = useMemo<AutofillDetail>(
    () => ({
      senderReceiverNames: uniq(messages.flatMap((d) => [d.sender, d.receiver])).filter(
        isNonEmptyString,
      ),
      senderReceiverDetails: uniq(
        messages
          .filter((d) => d.medium !== Medium.Radio)
          .flatMap((d) => [d.senderDetail, d.receiverDetail]),
      ).filter(isNonEmptyString),
      channelList: uniq(
        messages.filter((d) => d.medium === Medium.Radio).map((d) => d.senderDetail),
      ).filter(isNonEmptyString),
    }),
    [messages],
  );

  const saving = createState.loading || updateState.loading;
  const saveError = createState.error ?? updateState.error;

  const handleSave = useCallback(async () => {
    if (!incidentId) return;
    if (!canSave(state)) return;
    if (savingRef.current) return;
    savingRef.current = true;
    const time = state.time ?? new Date();
    const senderDetail = state.media !== Medium.Radio ? state.senderDetail : state.radioChannel;
    const receiverDetail = state.media !== Medium.Radio ? state.receiverDetail : state.radioChannel;
    try {
      if (state.messageToEdit?.id) {
        await updateMessage({
          incidentId,
          messageId: state.messageToEdit.id,
          time,
          content: state.content,
          medium: state.media,
          sender: state.sender,
          senderDetail,
          receiver: state.receiver,
          receiverDetail,
        });
      } else {
        const newId = await createMessage({
          incidentId,
          time,
          content: state.content,
          medium: state.media,
          sender: state.sender,
          senderDetail,
          receiver: state.receiver,
          receiverDetail,
        });
        if (newId) {
          const files = pendingFiles;
          setPendingFiles([]);
          for (const file of files) {
            await uploadAttachment({ incidentId, messageId: newId, file }).catch(() => {});
          }
        }
      }
      savingRef.current = false;
      if (blocker.state === "blocked") blocker.reset();
      dispatch({ type: "clear" });
    } catch {
      savingRef.current = false;
    }
  }, [state, createMessage, updateMessage, uploadAttachment, pendingFiles, incidentId, blocker]);

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

  if (loadedForId === incidentId && incident === null) {
    return <Navigate to="/incident/list" replace />;
  }
  if (loadedForId !== incidentId) {
    return <Spinner />;
  }

  const contextValue: EditorContextValue = {
    state,
    dispatch,
    onSave: handleSave,
    saving,
    autocompleteDetails,
    pendingFiles,
    addPendingFile,
    removePendingFile,
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
            {saveError && <Notification type="error">{saveError.message}</Notification>}
            {incidentIsClosed ? (
              <output className="notification is-warning is-light">
                {t("incidentClosedNoEdits")}
              </output>
            ) : (
              <InputBox />
            )}
          </div>
          <div className="column is-half">
            <List
              showControls={!incidentIsClosed}
              setEditorMessage={incidentIsClosed ? undefined : setEditorMessage}
              setTriageMessage={incidentIsClosed ? undefined : setTriageMessage}
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

function AttachmentUpload({
  messageId,
  incidentId,
}: {
  messageId: string | undefined;
  incidentId: string;
}) {
  const { t } = useTranslation();
  const { state, dispatch, pendingFiles, addPendingFile, removePendingFile } = useEditorContext();
  const [uploadAttachment, { loading, error }] = useUploadAttachment();
  const [removeAttachment] = useRemoveAttachment();
  // Track files uploaded during this edit session so the editor shows feedback immediately.
  const [justUploaded, setJustUploaded] = useState<{ filename: string }[]>([]);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      for (const file of accepted) {
        if (messageId) {
          const result = await uploadAttachment({ incidentId, messageId, file }).catch(() => null);
          if (result) {
            setJustUploaded((prev) => [...prev, { filename: result.filename }]);
          }
        } else {
          addPendingFile(file);
        }
      }
    },
    [messageId, incidentId, uploadAttachment, addPendingFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    disabled: loading,
    accept: {
      "image/*": [],
      "application/pdf": [".pdf"],
      "application/zip": [".zip"],
    },
  });

  // In edit mode, show existing attachments + just-uploaded ones for visual confirmation.
  const existingAttachments = messageId ? (state.messageToEdit?.attachments ?? []) : [];
  const justUploadedNew = justUploaded.filter(
    (u) => !existingAttachments.some((a) => a.filename === u.filename),
  );

  return (
    <FormRow label={t("message.attachments.title") as string}>
      {() => (
        <div>
          {/* Staged files for new message */}
          {!messageId && pendingFiles.length > 0 && (
            <div className="tags mb-2">
              {pendingFiles.map((f, i) => (
                <span key={i} className="tag is-light">
                  <span className="icon is-small mr-1">
                    <FontAwesomeIcon icon={faPaperclip} />
                  </span>
                  {f.name}
                  <button
                    type="button"
                    className="delete is-small"
                    aria-label={t("message.attachments.remove")}
                    onClick={() => removePendingFile(i)}
                  />
                </span>
              ))}
            </div>
          )}
          {/* Current attachments for edit mode — removable */}
          {messageId && (existingAttachments.length > 0 || justUploadedNew.length > 0) && (
            <div className="tags mb-2">
              {existingAttachments.map((a) => (
                <span key={a.id} className="tag is-light">
                  <span className="icon is-small mr-1">
                    <FontAwesomeIcon icon={faPaperclip} />
                  </span>
                  {a.filename}
                  <button
                    type="button"
                    className="delete is-small"
                    aria-label={t("message.attachments.remove")}
                    onClick={() => {
                      void removeAttachment({ incidentId, messageId, attachmentId: a.id }).then(
                        () => {
                          dispatch({ type: "remove_attachment", attachmentId: a.id });
                        },
                      );
                    }}
                  />
                </span>
              ))}
              {justUploadedNew.map((u) => (
                <span key={u.filename} className="tag is-light">
                  <span className="icon is-small mr-1">
                    <FontAwesomeIcon icon={faPaperclip} />
                  </span>
                  {u.filename}
                </span>
              ))}
            </div>
          )}
          {/* Drop zone */}
          <div
            {...getRootProps()}
            className={`file is-small${isDragActive ? " has-background-info-light" : ""}`}
            style={{
              border: "2px dashed #dbdbdb",
              borderRadius: "4px",
              padding: "8px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
            }}
          >
            <input {...getInputProps()} aria-label={t("message.attachments.add")} />
            {loading ? (
              <span className="icon is-small">
                <FontAwesomeIcon icon={faSpinner} spin />
              </span>
            ) : (
              <span className="icon is-small">
                <FontAwesomeIcon icon={faPaperclip} />
              </span>
            )}
            <span className="is-size-7">
              {isDragActive ? t("message.attachments.dropHere") : t("message.attachments.add")}
            </span>
          </div>
          {error && <p className="help is-danger mt-1">{t("message.attachments.uploadFailed")}</p>}
        </div>
      )}
    </FormRow>
  );
}

function InputBox() {
  const { t } = useTranslation();
  const { incidentId } = useParams();
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
    // 0 is the not-yet-assigned sentinel — this is a live preview, not a saved message.
    number: state.messageToEdit?.number ?? 0,
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
    attachments: state.messageToEdit?.attachments ?? [],
  };

  const mediumId = useId();
  return (
    <div className="box">
      <button
        type="button"
        className="delete is-pulled-right is-small mb-2"
        aria-label={t("close")}
        onClick={() => navigate(`/incident/${incidentId}/journal/messages`)}
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
        <MediumForm
          medium={state.media}
          afterContent={
            <AttachmentUpload messageId={state.messageToEdit?.id} incidentId={incidentId ?? ""} />
          }
        />
      </form>
      {(state.content !== "" || state.sender !== "" || state.receiver !== "") && (
        <>
          <div className="title is-size-4 is-capitalized">{t("preview")}</div>
          <JournalMessage
            id={undefined}
            incidentId={incidentId ?? ""}
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
