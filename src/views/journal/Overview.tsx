import { gql, useMutation, useQuery } from "@apollo/client";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

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
import { useTranslation } from "react-i18next";
import { Journal, JournalListData, JournalListVars } from "types";

dayjs.locale(de);
dayjs.extend(LocalizedFormat);

export const GET_JOURNALS = gql`
  query GetJournals($incidentId: uuid) {
    incidents(where: { id: { _eq: $incidentId } }) {
      id
      name
      journals(order_by: { createdAt: asc }) {
        id
        name
        createdAt
        updatedAt
        closedAt
        deletedAt
      }
    }
  }
`;

function Overview() {
  const { incidentId } = useParams();
  const [filterClosed, setFilterClosed] = useState(true);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { loading, error, data } = useQuery<JournalListData, JournalListVars>(GET_JOURNALS, {
    variables: { incidentId: incidentId || "" },
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
      <JournalTable
        journals={data.incidents[0].journals.filter((journal) => !filterClosed || journal.closedAt === null) || []}
      />
    </div >
  );
}

function JournalTable(props: { journals: Journal[] }) {
  const { t } = useTranslation();

  const { journals } = props;
  return (
    <table className="table is-hoverable is-narrow is-fullwidth is-striped">
      <thead>
        <tr>
          <th>{t('name')}</th>
          <th>{t('createdAt')}</th>
          <th>{t('closedAt')}</th>
          <th>{t('options')}</th>
        </tr>
      </thead>
      <tbody>
        {journals.map((journal) => (
          <tr key={journal.id}>
            <td>
              <Link to={`../${journal.id}/edit`}>{journal.name}</Link>
            </td>
            <td>{dayjs(journal.createdAt).format("LLL")}</td>
            <td>{journal.closedAt && dayjs(journal.closedAt).format("LLL")}</td>
            <td>
              <OptionButtons journal={journal} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const CLOSE_JOURNAL = gql`
  mutation CloseJournal($journalId: uuid, $closedAt: timestamptz) {
    update_journals(where: { id: { _eq: $journalId } }, _set: { closedAt: $closedAt }) {
      affected_rows
      returning {
        id
        closedAt
      }
    }
  }
`;

function OptionButtons(props: { journal: Journal }) {
  const { incidentId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [closeJournal] = useMutation(CLOSE_JOURNAL, {
    refetchQueries: [{ query: GET_JOURNALS, variables: { incidentId: incidentId } }],
  });

  let closeButtonClassNames = classNames({
    button: true,
    "is-light": true,
    "is-capitalized": true,
    "is-danger": props.journal.closedAt === null,
    "is-info": props.journal.closedAt !== null,
  });

  return (
    <div className="buttons are-small">
      <button className="button is-light is-link is-capitalized" onClick={() => navigate(`../${props.journal.id}/edit`)}>
        <span className="icon">
          <FontAwesomeIcon icon={faEdit} />
        </span>
        <span>{t('write')}</span>
      </button>
      <button className="button is-light is-success is-capitalized" onClick={() => navigate(`../${props.journal.id}`)}>
        <span className="icon">
          <FontAwesomeIcon icon={faChartSimple} />
        </span>
        <span>{t('feed')}</span>
      </button>
      {props.journal.closedAt === null ? (
        <button
          className={closeButtonClassNames}
          onClick={() => {
            closeJournal({
              variables: {
                journalId: props.journal.id,
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
          className={closeButtonClassNames}
          onClick={() => {
            closeJournal({
              variables: { journalId: props.journal.id, closedAt: null },
            });
          }}
        >
          <span className="icon">
            <FontAwesomeIcon icon={faFolderOpen} />
          </span>
          <span>{t('open')}</span>
        </button>
      )}
    </div>
  );
}

export default Overview;
