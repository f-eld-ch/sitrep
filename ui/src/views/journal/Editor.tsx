import { useTranslation } from "react-i18next";
import { faPaperclip, faSpinner, faXmark } from "@fortawesome/free-solid-svg-icons";
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
import { type Attachment, Medium, type Message, PriorityStatus, TriageStatus } from "types";
import { Spinner } from "components";
import { Button, Notification, PageTitle, Tag } from "components/ui";
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
    state.messageToEdit !== undefined ||
    pendingFiles.length > 0;

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
          const failedFiles: File[] = [];
          for (const file of pendingFiles) {
            try {
              await uploadAttachment({ incidentId, messageId: newId, file });
            } catch {
              failedFiles.push(file);
            }
          }
          setPendingFiles([]);
          if (failedFiles.length > 0) {
            // Switch to edit mode so a retry saves to the existing message
            // rather than creating a duplicate. The user can re-add failed
            // files via the attachment dropzone.
            dispatch({
              type: "set_edit_message",
              message: {
                id: newId,
                number: 0,
                sender: state.sender,
                senderDetail,
                receiver: state.receiver,
                receiverDetail,
                medium: state.media,
                content: state.content,
                time,
                priorityId: PriorityStatus.Normal,
                triageId: TriageStatus.Pending,
                divisions: [],
                attachments: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: new Date(0),
              },
            });
            savingRef.current = false;
            return;
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
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <PageTitle level={1} className="mb-4">
            {t("editor")}
          </PageTitle>
          {blocker.state === "blocked" && (
            <div className="bg-danger/10 border border-danger/30 rounded p-4 mb-4">
              <div className="flex justify-between items-start mb-2">
                <p className="text-sm">{t("unsavedChanges")}</p>
                <button
                  type="button"
                  className="text-fg-muted hover:text-fg text-sm leading-none p-1 -mt-1 -mr-1"
                  aria-label={t("cancel") as string}
                  onClick={() => blocker.reset()}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
              <Button type="button" variant="primary" size="sm" onClick={() => blocker.proceed()}>
                {t("discard")}
              </Button>
            </div>
          )}
          {saveError && (
            <Notification variant="danger" className="mb-4">
              {saveError.message}
            </Notification>
          )}
          {incidentIsClosed ? (
            <Notification variant="warning" light>
              {t("incidentClosedNoEdits")}
            </Notification>
          ) : (
            <InputBox />
          )}
        </div>
        <div className="flex-1 min-w-0">
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
  const [justUploaded, setJustUploaded] = useState<Attachment[]>([]);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      for (const file of accepted) {
        if (messageId) {
          const result = await uploadAttachment({ incidentId, messageId, file }).catch(() => null);
          if (result) {
            setJustUploaded((prev) => [...prev, result]);
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

  const existingAttachments = messageId ? (state.messageToEdit?.attachments ?? []) : [];
  const justUploadedNew = justUploaded.filter(
    (u) => !existingAttachments.some((a) => a.id === u.id),
  );

  const removeBtn = (onClick: () => void) => (
    <button
      type="button"
      className="ml-1 text-fg-muted hover:text-fg leading-none"
      aria-label={t("message.attachments.remove")}
      onClick={onClick}
    >
      <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
    </button>
  );

  return (
    <FormRow label={t("message.attachments.title") as string}>
      {() => (
        <div>
          {!messageId && pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {pendingFiles.map((f, i) => (
                <Tag key={i} size="sm" light>
                  <FontAwesomeIcon icon={faPaperclip} className="mr-1" />
                  {f.name}
                  {removeBtn(() => removePendingFile(i))}
                </Tag>
              ))}
            </div>
          )}
          {messageId && (existingAttachments.length > 0 || justUploadedNew.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {existingAttachments.map((a) => (
                <Tag key={a.id} size="sm" light>
                  <FontAwesomeIcon icon={faPaperclip} className="mr-1" />
                  {a.filename}
                  {removeBtn(() => {
                    dispatch({ type: "remove_attachment", attachmentId: a.id });
                    void removeAttachment({ incidentId, messageId, attachmentId: a.id });
                  })}
                </Tag>
              ))}
              {justUploadedNew.map((u) => (
                <Tag key={u.id} size="sm" light>
                  <FontAwesomeIcon icon={faPaperclip} className="mr-1" />
                  {u.filename}
                  {removeBtn(() => {
                    dispatch({ type: "remove_attachment", attachmentId: u.id });
                    void removeAttachment({
                      incidentId,
                      messageId: messageId!,
                      attachmentId: u.id,
                    });
                    setJustUploaded((prev) => prev.filter((j) => j.id !== u.id));
                  })}
                </Tag>
              ))}
            </div>
          )}
          <div
            {...getRootProps()}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded border-2 border-dashed cursor-pointer text-sm transition-colors ${
              isDragActive ? "border-info bg-info/10" : "border-border"
            }`}
          >
            <input {...getInputProps()} aria-label={t("message.attachments.add")} />
            {loading ? (
              <FontAwesomeIcon icon={faSpinner} spin className="text-fg-muted text-sm" />
            ) : (
              <FontAwesomeIcon icon={faPaperclip} className="text-fg-muted text-sm" />
            )}
            <span className="text-xs text-fg-muted">
              {isDragActive ? t("message.attachments.dropHere") : t("message.attachments.add")}
            </span>
          </div>
          {error && (
            <p className="text-xs text-danger mt-1">
              {error.code === "ATTACHMENT_TOO_LARGE"
                ? t("message.attachments.tooLarge")
                : error.code === "ATTACHMENT_DISABLED"
                  ? t("message.attachments.disabled")
                  : t("message.attachments.uploadFailed")}
            </p>
          )}
        </div>
      )}
    </FormRow>
  );
}

const selectClass =
  "w-full rounded border border-border px-3 py-1.5 text-sm bg-bg text-fg focus:outline-none focus:ring-1 focus:ring-primary";

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
    <div className="bg-bg-elevated border border-border rounded p-5 shadow-sm">
      <div className="flex justify-end mb-2">
        <button
          type="button"
          className="text-fg-muted hover:text-fg text-sm p-1 leading-none"
          aria-label={t("close")}
          onClick={() => navigate(`/incident/${incidentId}/journal/messages`)}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="flex flex-col xl:flex-row xl:gap-4 items-start mb-3">
        <div className="w-full xl:w-32 xl:shrink-0 xl:text-right xl:pt-1.5 mb-1 xl:mb-0">
          <label htmlFor={mediumId} className="text-sm font-bold capitalize">
            {t("mediumName")}
          </label>
        </div>
        <div className="flex-1 w-full min-w-0">
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-0">
              <select
                id={mediumId}
                value={state.media}
                onChange={handleMediumChange}
                className={selectClass}
              >
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
          <div className="text-xl font-bold capitalize mb-3 mt-4">{t("preview")}</div>
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
