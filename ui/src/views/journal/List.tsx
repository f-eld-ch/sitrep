import {
  faArrowsToEye,
  faBell,
  faChevronDown,
  faPrint,
  faUserGroup,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Spinner } from "components";
import { Button, Notification, PageTitle } from "components/ui";
import { memo, useEffect, useRef } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useReactToPrint } from "react-to-print";
import { type Division, type Message, PriorityStatus, TriageStatus } from "types";
import { useIncidentDetails, useIncidentMessages } from "api";
import { buildMessageList } from "./listUtils";
import { default as JournalMessage } from "./Message";
import MessageTable from "./Table";

const selectWithIcon =
  "rounded-full border border-border pl-8 pr-8 py-0.5 text-sm bg-bg text-fg focus:outline-none focus:ring-1 focus:ring-primary appearance-none";

function List(props: {
  showControls: boolean;
  autoScroll?: boolean;
  setEditorMessage?: (message: Message | undefined) => void;
  setTriageMessage?: (message: Message | undefined) => void;
}) {
  const { t } = useTranslation();
  const { incidentId } = useParams();
  const [triageFilter, setTriageFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const { autoScroll = false, showControls = true } = props;
  const tableRef = useRef(null);
  const handlePrint = useReactToPrint({
    contentRef: tableRef,
    pageStyle: "@page { size: A4 landscape;}",
  });

  const result = useIncidentMessages(incidentId ?? "");
  const incidentDetails = useIncidentDetails(incidentId);
  const incidentName =
    incidentDetails.status === "ready" ? incidentDetails.data.incident.name : undefined;

  useEffect(() => {
    if (autoScroll) {
      window.scroll({ top: 0, behavior: "smooth" });
    }
  }, [autoScroll]);

  if (result.status === "error") {
    return (
      <Notification variant="danger" light>
        {t(`errors.${result.error.code}`)}
      </Notification>
    );
  }

  if (result.status === "loading") return <Spinner />;

  const divisions: Division[] = result.data.incidentDivisions;

  const messages = buildMessageList(result.data.messages, {
    triage: triageFilter,
    priority: priorityFilter,
    assignment: assignmentFilter,
  });

  return (
    <>
      <div className="print:hidden">
        <PageTitle className="mb-3">{t("journal")}</PageTitle>
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          {/* Triage filter */}
          <div className="relative group">
            <span className="absolute inset-y-0 left-0 w-8 flex items-center justify-center text-fg-muted/50 group-hover:text-fg-muted group-focus-within:text-fg-muted pointer-events-none text-xs transition-colors">
              <FontAwesomeIcon icon={faArrowsToEye} />
            </span>
            <select
              className={selectWithIcon}
              value={triageFilter}
              onChange={(e) => {
                e.preventDefault();
                setTriageFilter(e.target.value);
              }}
            >
              <option label={t("all") as string}>all</option>
              {Object.values(TriageStatus).map((status: TriageStatus) => (
                <option
                  key={status}
                  label={t([`triage.${status}`, `triage.${TriageStatus.Pending}`]) as string}
                >
                  {status}
                </option>
              ))}
            </select>
            <span className="absolute inset-y-0 right-0 w-8 flex items-center justify-center text-fg-muted/50 group-hover:text-fg-muted group-focus-within:text-fg-muted pointer-events-none text-xs transition-colors">
              <FontAwesomeIcon icon={faChevronDown} />
            </span>
          </div>

          {/* Priority filter */}
          <div className="relative group">
            <span className="absolute inset-y-0 left-0 w-8 flex items-center justify-center text-fg-muted/50 group-hover:text-fg-muted group-focus-within:text-fg-muted pointer-events-none text-xs transition-colors">
              <FontAwesomeIcon icon={faBell} />
            </span>
            <select
              className={selectWithIcon}
              value={priorityFilter}
              onChange={(e) => {
                e.preventDefault();
                setPriorityFilter(e.target.value);
              }}
            >
              <option label={t("all") as string}>all</option>
              {Object.values(PriorityStatus).map((prio: PriorityStatus) => (
                <option
                  key={prio}
                  label={t([`priority.${prio}`, `priority.${PriorityStatus.Normal}`]) as string}
                >
                  {prio}
                </option>
              ))}
            </select>
            <span className="absolute inset-y-0 right-0 w-8 flex items-center justify-center text-fg-muted/50 group-hover:text-fg-muted group-focus-within:text-fg-muted pointer-events-none text-xs transition-colors">
              <FontAwesomeIcon icon={faChevronDown} />
            </span>
          </div>

          {/* Assignment filter */}
          <div className="relative group">
            <span className="absolute inset-y-0 left-0 w-8 flex items-center justify-center text-fg-muted/50 group-hover:text-fg-muted group-focus-within:text-fg-muted pointer-events-none text-xs transition-colors">
              <FontAwesomeIcon icon={faUserGroup} />
            </span>
            <select
              className={selectWithIcon}
              value={assignmentFilter}
              onChange={(e) => {
                e.preventDefault();
                setAssignmentFilter(e.target.value);
              }}
            >
              <option label={t("all") as string}>all</option>
              {divisions.map((element) => (
                <option key={element.id} value={element.name}>
                  {element.description}
                </option>
              ))}
            </select>
            <span className="absolute inset-y-0 right-0 w-8 flex items-center justify-center text-fg-muted/50 group-hover:text-fg-muted group-focus-within:text-fg-muted pointer-events-none text-xs transition-colors">
              <FontAwesomeIcon icon={faChevronDown} />
            </span>
          </div>

          {showControls && (
            <Button
              type="button"
              variant="primary"
              size="xs"
              className="ml-auto"
              onClick={() => handlePrint()}
            >
              <FontAwesomeIcon icon={faPrint} />
              <span>{t("print")}</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <MemoMessages
          messages={messages}
          divisions={divisions}
          incidentId={incidentId ?? ""}
          showControls={props.showControls}
          setTriageMessage={props.setTriageMessage}
          setEditorMessage={props.setEditorMessage}
        />
      </div>

      <div style={{ display: "none" }}>
        <MessageTable
          ref={tableRef}
          messages={messages}
          triageFilter={triageFilter}
          priorityFilter={priorityFilter}
          assignmentFilter={assignmentFilter}
          incidentName={incidentName}
        />
      </div>
    </>
  );
}

const MemoMessages = memo(Messages);

function Messages(props: {
  showControls: boolean;
  incidentId: string;
  setEditorMessage?: (message: Message | undefined) => void;
  setTriageMessage?: (message: Message | undefined) => void;
  messages: Message[];
  divisions: Division[];
}) {
  return (
    <>
      {props.messages.map((message) => (
        <JournalMessage
          key={message.id}
          id={message.id}
          incidentId={props.incidentId}
          message={message}
          divisions={props.divisions}
          showControls={props.showControls}
          setEditorMessage={props.setEditorMessage}
          setTriageMessage={props.setTriageMessage}
        />
      ))}
    </>
  );
}

export default memo(List);
