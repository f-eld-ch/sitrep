import React, { useState } from "react";
import { useQuery, gql, useMutation } from "@apollo/client";
import { Link, useNavigate } from "react-router-dom";
import { Spinner } from "components";
import { Incident, IncidentListData } from "../../types";
import dayjs from "dayjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRightFromBracket,
  faEdit,
  faEye,
  faEyeLowVision,
  faFolderClosed,
  faFolderOpen,
  faPlusCircle,
} from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";

const GET_INCIDENTS = gql`
  query FetchIncidents {
    incidents(order_by: { createdAt: desc }) {
      id
      name
      createdAt
      updatedAt
      deletedAt
      closedAt
      location {
        name
        coordinates
      }
    }
  }
`;

function List() {
  const [filterClosed, setFilterClosed] = useState(true);
  const navigate = useNavigate();

  const { loading, error, data } = useQuery<IncidentListData>(GET_INCIDENTS);

  if (error) return <div className="notification is-danger">{error.message}</div>;
  if (loading) return <Spinner />;

  return (
    <div>
      <h3 className="title is-size-3">Ereignisse</h3>
      <div className="buttons">
        <button
          className="button is-success is-small is-responsive is-rounded is-light"
          onClick={() => navigate("../new")}
        >
          <span className="icon is-small">
            <FontAwesomeIcon icon={faPlusCircle} />
          </span>
          <span>Erstellen</span>
        </button>
        <button
          className="button is-primary is-small is-responsive is-rounded is-light"
          onClick={() => setFilterClosed(!filterClosed)}
        >
          <span className="icon is-small">
            <FontAwesomeIcon icon={filterClosed ? faEye : faEyeLowVision} />
          </span>
          <span>{filterClosed ? "Zeige geschlossene" : "Verstecke geschlossene"}</span>
        </button>
      </div>
      <table className="table is-hoverable is-fullwidth is-striped">
        <thead>
          <tr>
            <th>Name</th>
            <th>Ort</th>
            <th>Eröffnet</th>
            <th>Geschlossen</th>
            <th>Optionen</th>
          </tr>
        </thead>
        <tbody>
          {data &&
            data.incidents
              .filter((incident) => !filterClosed || incident.closedAt === null)
              .map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <Link to={`../${incident.id}/journal/view`}>{incident.name}</Link>
                  </td>
                  <td>{incident.location.name}</td>
                  <td>{dayjs(incident.createdAt).format("LLL")}</td>
                  <td>{incident.closedAt && dayjs(incident.closedAt).format("LLL")}</td>
                  <td>
                    <Option incident={incident} />
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

const CLOSE_INCIDENT = gql`
  mutation CloseIncident($incidentId: uuid, $closedAt: timestamptz) {
    update_incidents(where: { id: { _eq: $incidentId } }, _set: { closedAt: $closedAt }) {
      affected_rows
      returning {
        id
        closedAt
      }
    }
  }
`;

interface IOptionProps {
  incident: Incident;
}

function Option(props: IOptionProps) {
  const navigate = useNavigate();

  const [closeIncident] = useMutation(CLOSE_INCIDENT, {
    refetchQueries: [{ query: GET_INCIDENTS }, "FetchIncidents"],
  });

  let closeButtonClassNames = classNames({
    button: true,
    "is-light": true,
    "is-danger": props.incident.closedAt === null,
    "is-info": props.incident.closedAt !== null,
  });

  return (
    <div className="buttons are-small">
      <button className="button is-light is-success" onClick={() => navigate(`../${props.incident.id}/journal/view`)}>
        <span className="icon">
          <FontAwesomeIcon icon={faArrowRightFromBracket} />
        </span>
        <span>Eintreten</span>
      </button>
      <button className="button is-light is-warning" onClick={() => navigate(`../${props.incident.id}/edit`)}>
        <span className="icon">
          <FontAwesomeIcon icon={faEdit} />
        </span>
        <span>Bearbeiten</span>
      </button>
      {props.incident.closedAt === null ? (
        <button
          className={closeButtonClassNames}
          onClick={() => {
            closeIncident({
              variables: {
                incidentId: props.incident.id,
                closedAt: new Date(),
              },
            });
          }}
        >
          <span className="icon">
            <FontAwesomeIcon icon={faFolderClosed} />
          </span>
          <span>Beenden</span>
        </button>
      ) : (
        <button
          className={closeButtonClassNames}
          onClick={() => {
            closeIncident({
              variables: { incidentId: props.incident.id, closedAt: null },
            });
          }}
        >
          <span className="icon">
            <FontAwesomeIcon icon={faFolderOpen} />
          </span>
          <span>Öffnen</span>
        </button>
      )}
    </div>
  );
}

export default List;
