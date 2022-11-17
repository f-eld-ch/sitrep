import { useMutation, useQuery } from "@apollo/client";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  faChartSimple,
  faEdit,
  faEye,
  faEyeLowVision,
  faFolderClosed,
  faFolderOpen,
  faPlusCircle
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { Spinner } from "components";
import dayjs from "dayjs";
import de from "dayjs/locale/de";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import { t } from "i18next";
import { useTranslation } from "react-i18next";
import { Journal, JournalListData, JournalListVars } from "types";
import { CloseJournal, GetJournals } from "./graphql";

dayjs.locale(de);
dayjs.extend(LocalizedFormat);

function Overview() {
  const { incidentId } = useParams();
  const [filterClosed, setFilterClosed] = useState(true);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { loading, error, data } = useQuery<JournalListData, JournalListVars>(GetJournals, {
    variables: { incidentId: incidentId || "" },
    pollInterval: 10000,
  });

  if (error) return <div className="notification is-danger">{error.message}</div>;

  if (loading) return <Spinner />;

  if (!data || !(data.incidents.length === 1))
    return <div className="notification is-danger">Unerwarteter Fehler beim Laden des Ereignisses.</div>;

  const incident = data.incidents[0];

  return (
    <div>
      <h3 className="title is-size-3 is-capitalized">{t('journalList')}</h3>
      <h3 className="subtitle is-capitalized">{t('incident')}: {incident.name}</h3>

      <div className="buttons">
        <button
          className="button is-success is-small is-responsive is-rounded is-light is-capitalized"
          onClick={() => navigate("../new")}
        >
          <span className="icon is-small">
            <FontAwesomeIcon icon={faPlusCircle} />
          </span>
          <span>{t('create')}</span>
        </button>
        <button
          className="button is-primary is-small is-responsive is-rounded is-light"
          onClick={() => setFilterClosed(!filterClosed)}
        >
          <span className="icon is-small">
            <FontAwesomeIcon icon={filterClosed ? faEye : faEyeLowVision} />
          </span>
          <span>{filterClosed ? t('showClosed') : t('hideClosed')}</span>
        </button>
      </div>

      <JournalCards
        journals={data.incidents[0].journals.filter((journal) => !filterClosed || journal.closedAt === null) || []}
        incidentId={incidentId}
      />
    </div >
  );
}


function JournalCards(props: { journals: Journal[], incidentId: string | undefined }) {
  const { journals, incidentId } = props;

  const [closeJournal] = useMutation(CloseJournal, {
    refetchQueries: [{ query: GetJournals, variables: { incidentId: incidentId } }],
  });


  return (
    <div className="container-flex">
      {
        journals.map((journal) => (
          <JournalCard key={journal.id} journal={journal} closeJournal={closeJournal} />
        ))
      }
    </div >
  )
}

function JournalCard(props: { journal: Journal, closeJournal: any }) {
  const { journal, closeJournal } = props;
  const navigate = useNavigate();

  const cardClass = classNames({
    card: true,
    "mb-3": true,
    "has-background-primary-light": journal.closedAt
  });
  return (
    <div className={cardClass} >
      <div className="card-content">
        <div className="content has-text-small">
          <h4 className="title is-5">{journal.name}</h4>
          <div className="columns">
            <div className="column is-one-third">
              <strong>{t('createdAt')}: </strong>{dayjs(journal.createdAt).format("LLL")}
            </div>
            {journal.closedAt && <div className="column">
              <strong>{t('closedAt')}: </strong>{dayjs(journal.closedAt).format("LLL")}
            </div>}
          </div>
        </div>
      </div>
      <footer className="card-footer">
        <button
          className="card-footer-item is-ahref is-capitalized"
          onClick={() => navigate(`../${journal.id}/edit`)}
        >
          <span className="icon">
            <FontAwesomeIcon icon={faEdit} />
          </span>
          <span>{t('write')}</span>
        </button>
        <button
          className="card-footer-item is-ahref is-capitalized"
          onClick={() => navigate(`../${journal.id}`)}
        >
          <span className="icon">
            <FontAwesomeIcon icon={faChartSimple} />
          </span>
          <span>{t('feed')}</span>
        </button>
        {journal.closedAt === null ? (
          <button
            className="card-footer-item is-ahref is-capitalized"
            onClick={() => {
              closeJournal({
                variables: {
                  journalId: journal.id,
                  closedAt: new Date(),
                },
              });
            }}
          >
            <span className="icon">
              <FontAwesomeIcon icon={faFolderClosed} />
            </span>
            <span>{t('close')}</span>
          </button>
        ) : (
          <button
            className="card-footer-item is-ahref is-capitalized is-success"
            onClick={() => {
              closeJournal({
                variables: {
                  journalId: journal.id,
                  closedAt: undefined,
                },
              })
            }}
          >
            <span className="icon">
              <FontAwesomeIcon icon={faFolderOpen} />
            </span>
            <span>{t('open')}</span>
          </button>
        )}
      </footer>
    </div>
  )
}

export default Overview;
