import { useQuery } from "@apollo/client";
import { faBars, faExplosion } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect } from "react";
import { NavLink, useParams } from "react-router-dom";
import { IncidentDetailsData, IncidentDetailsVars } from "types";
import { GetIncidentDetails } from "views/incident/graphql";

export function Breadcrumb() {
  const { incidentId, journalId } = useParams();

  const { data: incidentData, refetch } = useQuery<IncidentDetailsData, IncidentDetailsVars>(GetIncidentDetails, {
    variables: { incidentId: incidentId || "" },
  });

  useEffect(() => {
    refetch({ incidentId: incidentId || "" });
  }, [incidentId, journalId, refetch]);

  return (
    <nav className="breadcrumb is-right has-bullet-separator is-hidden-print" aria-label="breadcrumbs">
      <ul>
        {incidentData?.incidents_by_pk.name ? (
          <li>
            <NavLink
              className={({ isActive }) => (isActive ? "is-active" : undefined)}
              to={`/incident/${incidentId}/edit`}
            >
              <span className="icon-text is-small">
                <span className="icon">
                  <FontAwesomeIcon icon={faExplosion} />
                </span>
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
              <span className="icon-text is-small">
                <span className="icon">
                  <FontAwesomeIcon icon={faBars} />
                </span>
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
