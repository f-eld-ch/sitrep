import { gql, useQuery } from "@apollo/client";
import { faBars, faExplosion } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { NavLink, useParams } from "react-router-dom";
import { IncidentDetailsData, IncidentDetailsVars } from "types";
import { GET_INCIDENT_DETAILS } from "views/incident/Dashboard";

export const GET_JOURNAL_DETAILS = gql`
  query GetJournalDetails($journalId: uuid!) {
    journals_by_pk(id: $incidentId) {
      id
      name
      createdAt
      closedAt
      updatedAt
    }
  }
`;

export function Breadcrump() {
  const { incidentId, journalId } = useParams();

  const { data: incidentData } = useQuery<IncidentDetailsData, IncidentDetailsVars>(GET_INCIDENT_DETAILS, {
    variables: { incidentId: incidentId || "" },
  });

  return (
    <nav className="breadcrumb is-right has-bullet-separator is-small" aria-label="breadcrumbs">
      <ul>
        {incidentData?.incidents_by_pk.name ? (
          <li>
            <NavLink
              className={({ isActive }) => (isActive ? "is-active" : undefined)}
              to={`/incident/${incidentId}/edit`}
            >
              <span className="icon-text">
                <FontAwesomeIcon icon={faExplosion} className="icon" />
                <span>{incidentData?.incidents_by_pk.name}</span>
              </span>
            </NavLink>
          </li>
        ) : (
          <></>
        )}
        {journalId && incidentData?.incidents_by_pk.journals.find((j) => j.id === journalId) ? (
          <li>
            <NavLink
              className={({ isActive }) => (isActive ? "is-active" : undefined)}
              to={`/incident/${incidentId}/journal/${journalId}/edit`}
            >
              <span className="icon-text">
                <FontAwesomeIcon icon={faBars} className="icon" />
                <span>{incidentData?.incidents_by_pk.journals.find((j) => j.id === journalId)?.name}</span>
              </span>
            </NavLink>
          </li>
        ) : (
          <></>
        )}
      </ul>
    </nav>
  );
}
