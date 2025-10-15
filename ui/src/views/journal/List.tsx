import { useQuery } from "@apollo/client/react";
import {
  faArrowsToEye,
  faBell,
  faPrint,
  faUserGroup,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { Spinner } from "components";
import { memo, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useReactToPrint } from "react-to-print";
import {
  type Division,
  type Message,
  PriorityStatus,
  TriageStatus,
} from "types";
import { GetJournalMessages } from "./graphql";
import { default as JournalMessage } from "./Message";
import MessageTable from "./Table";

function List(props: {
  showControls: boolean;
  autoScroll?: boolean;
  setEditorMessage?: (message: Message | undefined) => void;
  setTriageMessage?: (message: Message | undefined) => void;
}) {
  const { t } = useTranslation();
  const { journalId } = useParams();
  const [triageFilter, setTriageFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const { autoScroll = false, showControls = true } = props;
  const tableRef = useRef(null);
  const handlePrint = useReactToPrint({
    contentRef: tableRef,
    pageStyle: "@page { size: A4 landscape;}",
  });

  const { loading, error, data } = useQuery(GetJournalMessages, {
    variables: { journalId: journalId || "" },
    pollInterval: 10000,
  });

  const printButtonClass = classNames({
    "is-hidden": !showControls,
    column: true,
    "is-narrow": true,
  });

  // on new messages scale to top
  useEffect(() => {
    if (autoScroll) {
      window.scroll({
        top: 0,
        behavior: "smooth",
      });
    }
  }, [autoScroll]);

  if (error) {
    return (
      <div className="notification is-danger is-light">
        <div className="block has-text-weight-semibold">
          Ups, da ging was schief:
        </div>
        <div className="block">{error.message}</div>
      </div>
    );
  }

  if (loading && !data) return <Spinner />;
  const divisions: Division[] =
    data?.journalsByPk?.incident?.divisions?.flat() || [];

  const messages =
    data?.messages
      .filter(
        (message) =>
          triageFilter === "all" || message.triageId === triageFilter,
      )
      .filter(
        (message) =>
          priorityFilter === "all" || message.priorityId === priorityFilter,
      )
      .filter(
        (message) =>
          assignmentFilter === "all" ||
          message.divisions?.find((d) => d.division.name === assignmentFilter),
      ) || [];

  return (
    <>
      <div className="is-hidden-print">
        <h3 className="title is-3 is-capitalized">{t("journal")}</h3>
        <div className="columns is-mobile is-multiline is-2">
          <div className="column is-narrow">
            <div className="control has-icons-left">
              <div className="select is-small is-rounded">
                <select
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
                      label={
                        t([
                          `triage.${status}`,
                          `triage.${TriageStatus.Pending}`,
                        ]) as string
                      }
                    >
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="icon is-small is-left">
                <FontAwesomeIcon icon={faArrowsToEye} />
              </div>
            </div>
          </div>
          <div className="column is-narrow">
            <div className="control has-icons-left">
              <div className="select is-small is-rounded">
                <select
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
                      label={
                        t([
                          `priority.${prio}`,
                          `priority.${PriorityStatus.Normal}`,
                        ]) as string
                      }
                    >
                      {prio}
                    </option>
                  ))}
                </select>
              </div>
              <div className="icon is-small is-left">
                <FontAwesomeIcon icon={faBell} />
              </div>
            </div>
          </div>
          <div className="column is-narrow">
            <div className="control has-icons-left">
              <div className="select is-small is-rounded">
                <select
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
              </div>
              <div className="icon is-small is-left">
                <FontAwesomeIcon icon={faUserGroup} />
              </div>
            </div>
          </div>
          <div className={printButtonClass}>
            <button
              type="button"
              className="button is-small is-rounded"
              onClick={() => handlePrint()}
            >
              <FontAwesomeIcon icon={faPrint} />
              &nbsp;{t("print")}
            </button>
          </div>
        </div>
      </div>
      <div className="columns is-multiline is-gapless">
        {data && (
          <MemoMessages
            messages={messages}
            divisions={divisions}
            showControls={props.showControls}
            setTriageMessage={props.setTriageMessage}
            setEditorMessage={props.setEditorMessage}
          />
        )}
      </div>
      <div style={{ display: "none" }}>
        <MessageTable
          ref={tableRef}
          messages={messages}
          triageFilter={triageFilter}
          priorityFilter={priorityFilter}
          assignmentFilter={assignmentFilter}
        />
      </div>
    </>
  );
}

const MemoMessages = memo(Messages);

function Messages(props: {
  showControls: boolean;
  setEditorMessage?: (message: Message | undefined) => void;
  setTriageMessage?: (message: Message | undefined) => void;
  messages: Message[];
  divisions: Division[];
}) {
  return (
    <>
      {props.messages.map((message) => {
        return (
          <div key={message.id} className="column is-full mt-3">
            <JournalMessage
              key={message.id}
              id={message.id}
              message={message}
              divisions={props.divisions}
              showControls={props.showControls}
              setEditorMessage={props.setEditorMessage}
              setTriageMessage={props.setTriageMessage}
            />
          </div>
        );
      })}
    </>
  );
}

export default memo(List);
