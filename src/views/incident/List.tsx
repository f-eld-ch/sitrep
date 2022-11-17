import { useMutation, useQuery } from "@apollo/client";
import {
  faArrowRightFromBracket,
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
import { t } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Incident, IncidentListData } from "../../types";
import { CloseIncident, GetIncidentDetails, GetIncidents } from "./graphql";


function List() {
  const [filterClosed, setFilterClosed] = useState(true);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { loading, error, data } = useQuery<IncidentListData>(GetIncidents,
    {
      pollInterval: 10000,
    }
  );

  if (error) return <div className="notification is-danger">{error.message}</div>;
  if (loading) return <Spinner />;

  return (
    <div>
      <h3 className="title is-size-3 is-capitalized">{t('incidents')}</h3>
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
      <IncidentCards
        incidents={(data && data.incidents.filter((incident) => !filterClosed || incident.closedAt === null)) || []}
      />
    </div>
  );
}

function IncidentCards(props: { incidents: Incident[] }) {
  const { incidents } = props;
  const [closeIncident] = useMutation(CloseIncident, {
    refetchQueries: [{ query: GetIncidents }, { query: GetIncidentDetails }],
  });

  return (
    <div className="container-flex">
      {
        incidents.map((incident) => (
          <IncidentCard key={incident.id} incident={incident} closeIncident={closeIncident} />
        ))
      }
    </div >
  )
}

function IncidentCard(props: { incident: Incident, closeIncident: any }) {
  const { incident, closeIncident } = props;
  const navigate = useNavigate();

  const cardClass = classNames({
    card: true,
    "mb-3": true,
    "has-background-primary-light": incident.closedAt
  });
  return (
    <div className={cardClass} >
      <div className="card-content">
        <div className="content has-text-small">
          <h4 className="title is-5">{incident.name}</h4>
          <div className="columns">
            <div className="column is-one-third">
              <strong>{t('location')}: </strong>{incident.location.name}
            </div>
            <div className="column is-one-third">
              <strong>{t('createdAt')}: </strong>{dayjs(incident.createdAt).format("LLL")}
            </div>
            {incident.closedAt && <div className="column">
              <strong>{t('closedAt')}: </strong>{dayjs(incident.closedAt).format("LLL")}
            </div>}
          </div>
        </div>
      </div>
      <footer className="card-footer">
        <button
          className="card-footer-item is-ahref is-capitalized"
          onClick={() => navigate(`../${props.incident.id}/journal/view`)}
        >
          <span className="icon">
            <FontAwesomeIcon icon={faArrowRightFromBracket} />
          </span>
          <span>{t('enter')}</span>
        </button>
        <button
          className="card-footer-item is-ahref is-capitalized"
          onClick={() => navigate(`../${incident.id}/edit`)}
        >
          <span className="icon">
            <FontAwesomeIcon icon={faEdit} />
          </span>
          <span>{t('edit')}</span>
        </button>
        {incident.closedAt === null ? (
          <button
            className="card-footer-item is-ahref is-capitalized is-danger"
            onClick={() => {
              closeIncident({
                variables: {
                  incidentId: incident.id,
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
              closeIncident({
                variables: { incidentId: incident.id, closedAt: null },
              });
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

export default List;
