import {
  faChartSimple,
  faEdit,
  faEye,
  faEyeLowVision,
  faFolderClosed,
  faFolderOpen,
  faPlusCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { Spinner } from "components";
import dayjs from "dayjs";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import type { Journal } from "types";
import { IncidentContext } from "utils";
import { useCloseJournal, useJournals, useReopenJournal } from "api";

function Overview() {
  const { incidentId } = useParams();
  const [filterClosed, setFilterClosed] = useState(true);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    dayjs.extend(LocalizedFormat);
    dayjs.extend(relativeTime);
  }, []);

  const result = useJournals(incidentId);

  if (result.status === "error") {
    return <div className="notification is-danger">{result.error.message}</div>;
  }

  if (result.status === "loading") return <Spinner />;

  const { incidentName, journals } = result.data;

  return (
    <div>
      <h3 className="title is-size-3 is-capitalized">{t("journalList")}</h3>
      <h3 className="subtitle is-capitalized">
        {t("incident")}: {incidentName}
      </h3>

      <div className="buttons">
        <button
          type="button"
          className="button is-success is-small is-responsive is-rounded is-light is-capitalized"
          onClick={() => navigate("../new")}
        >
          <span className="icon is-small">
            <FontAwesomeIcon icon={faPlusCircle} />
          </span>
          <span>{t("create")}</span>
        </button>
        <button
          type="button"
          className="button is-primary is-small is-responsive is-rounded is-light"
          onClick={() => setFilterClosed(!filterClosed)}
        >
          <span className="icon is-small">
            <FontAwesomeIcon icon={filterClosed ? faEye : faEyeLowVision} />
          </span>
          <span>{filterClosed ? t("showClosed") : t("hideClosed")}</span>
        </button>
      </div>

      <JournalCards
        journals={journals.filter((j) => !filterClosed || j.closedAt === null)}
        incidentId={incidentId}
      />
    </div>
  );
}

function JournalCards(props: { journals: Journal[]; incidentId: string | undefined }) {
  const { journals, incidentId } = props;

  return (
    <div className="container-flex">
      {journals.map((journal) => (
        <JournalCard key={journal.id} journal={journal} incidentId={incidentId} />
      ))}
    </div>
  );
}

function JournalCard(props: { journal: Journal; incidentId: string | undefined }) {
  const { journal, incidentId } = props;
  const navigate = useNavigate();
  const { dispatch } = useContext(IncidentContext);
  const { t } = useTranslation();

  const [closeJournal] = useCloseJournal();
  const [reopenJournal] = useReopenJournal();

  const cardClass = classNames({
    card: true,
    "mb-3": true,
    "has-background-primary-light": journal.closedAt,
  });

  return (
    <div className={cardClass}>
      <div className="card-content">
        <div className="content has-text-small">
          <h4 className="title is-5">{journal.name}</h4>
          <div className="columns">
            <div className="column is-one-third">
              <strong>{t("createdAt")}: </strong>
              {dayjs(journal.createdAt).format("LLL")}
            </div>
            {journal.closedAt && (
              <div className="column">
                <strong>{t("closedAt")}: </strong>
                {dayjs(journal.closedAt).format("LLL")}
              </div>
            )}
          </div>
        </div>
      </div>
      <footer className="card-footer">
        <button
          type="button"
          className="card-footer-item is-ahref is-capitalized"
          onClick={() => {
            navigate(`../${journal.id}/edit`);
            dispatch({ type: "SET_JOURNAL", payload: journal });
          }}
        >
          <span className="icon">
            <FontAwesomeIcon icon={faEdit} />
          </span>
          <span>{t("write")}</span>
        </button>
        <button
          type="button"
          className="card-footer-item is-ahref is-capitalized"
          onClick={() => navigate(`../${journal.id}`)}
        >
          <span className="icon">
            <FontAwesomeIcon icon={faChartSimple} />
          </span>
          <span>{t("feed")}</span>
        </button>
        {journal.closedAt === null ? (
          <button
            type="button"
            className="card-footer-item is-ahref is-capitalized"
            onClick={() =>
              void closeJournal({ journalId: journal.id, incidentId: incidentId ?? "" })
            }
          >
            <span className="icon">
              <FontAwesomeIcon icon={faFolderClosed} />
            </span>
            <span>{t("close")}</span>
          </button>
        ) : (
          <button
            type="button"
            className="card-footer-item is-ahref is-capitalized is-success"
            onClick={() =>
              void reopenJournal({ journalId: journal.id, incidentId: incidentId ?? "" })
            }
          >
            <span className="icon">
              <FontAwesomeIcon icon={faFolderOpen} />
            </span>
            <span>{t("open")}</span>
          </button>
        )}
      </footer>
    </div>
  );
}

export default Overview;
