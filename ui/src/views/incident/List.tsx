import {
  faArrowRightFromBracket,
  faEdit,
  faEye,
  faEyeLowVision,
  faFolderClosed,
  faFolderOpen,
  faPlusCircle,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { Spinner } from "components";
import dayjs from "dayjs";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { IncidentContext } from "utils";
import type { Incident } from "../../types";
import { useCloseIncident, useDeleteIncident, useIncidents, useReopenIncident } from "api";

function List() {
  const [filterClosed, setFilterClosed] = useState(true);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const result = useIncidents();
  const [closeIncident, closeState] = useCloseIncident();
  const [reopenIncident] = useReopenIncident();
  const [deleteIncident, deleteState] = useDeleteIncident();

  const mutationError = closeState.error ?? deleteState.error;

  if (result.status === "error") {
    return <div className="notification is-danger">{t(`errors.${result.error.code}`)}</div>;
  }
  if (result.status === "loading") return <Spinner />;

  return (
    <div>
      <h3 className="title is-size-3 is-capitalized">{t("incidents")}</h3>
      {mutationError && (
        <div className="notification is-danger">{t(`errors.${mutationError.code}`)}</div>
      )}
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
      <IncidentCards
        incidents={result.data.incidents}
        closeIncident={(id) => closeIncident({ incidentId: id })}
        reopenIncident={(id) => reopenIncident({ incidentId: id })}
        deleteIncident={(id) => deleteIncident({ incidentId: id })}
        hideClosed={filterClosed}
      />
    </div>
  );
}

export function IncidentCards(props: {
  incidents: Incident[];
  closeIncident: (incidentId: string) => Promise<void>;
  reopenIncident: (incidentId: string) => Promise<void>;
  deleteIncident: (incidentId: string) => Promise<void>;
  hideClosed?: boolean;
}) {
  const { incidents, closeIncident, reopenIncident, deleteIncident, hideClosed = false } = props;

  const activeIncidents = incidents.filter((incident) => !incident.deletedAt);
  const incidentIDs = new Set(activeIncidents.map((incident) => incident.id));
  const childrenByParent = new Map<string, Incident[]>();

  for (const incident of activeIncidents) {
    if (!incident.parentId || !incidentIDs.has(incident.parentId)) continue;

    childrenByParent.set(incident.parentId, [
      ...(childrenByParent.get(incident.parentId) ?? []),
      incident,
    ]);
  }

  const isVisible = (incident: Incident) => !hideClosed || incident.closedAt === null;
  const topLevelIncidents = activeIncidents.filter(
    (incident) => !incident.parentId || !incidentIDs.has(incident.parentId),
  );

  return (
    <div className="container-flex">
      {topLevelIncidents.map((incident) => {
        const children = childrenByParent.get(incident.id) ?? [];
        const visibleChildren = children.filter(isVisible);
        const showIncident = isVisible(incident) || visibleChildren.length > 0;

        if (!showIncident) return null;

        return (
          <div key={incident.id} className="mb-4">
            <IncidentCard
              incident={incident}
              closeIncident={closeIncident}
              reopenIncident={reopenIncident}
              deleteIncident={deleteIncident}
              childCount={children.length}
              contextOnly={!isVisible(incident)}
            />
            {visibleChildren.length > 0 && (
              <div className="ml-5 pl-4" style={{ borderLeft: "3px solid var(--bulma-info)" }}>
                {visibleChildren.map((child) => (
                  <IncidentCard
                    key={child.id}
                    incident={child}
                    closeIncident={closeIncident}
                    reopenIncident={reopenIncident}
                    deleteIncident={deleteIncident}
                    isChild={true}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {activeIncidents
        .filter((incident) => incident.parentId && !incidentIDs.has(incident.parentId))
        .filter(isVisible)
        .map((incident) => (
          <IncidentCard
            key={incident.id}
            incident={incident}
            closeIncident={closeIncident}
            reopenIncident={reopenIncident}
            deleteIncident={deleteIncident}
            isChild={true}
          />
        ))}
    </div>
  );
}

export function IncidentCard(props: {
  incident: Incident;
  closeIncident: (incidentId: string) => Promise<void>;
  reopenIncident: (incidentId: string) => Promise<void>;
  deleteIncident: (incidentId: string) => Promise<void>;
  isChild?: boolean;
  childCount?: number;
  contextOnly?: boolean;
}) {
  const {
    incident,
    closeIncident,
    reopenIncident,
    deleteIncident,
    isChild = false,
    childCount = 0,
    contextOnly = false,
  } = props;
  const navigate = useNavigate();
  const { dispatch } = useContext(IncidentContext);
  const { t } = useTranslation();

  const cardClass = classNames({
    card: true,
    "mb-3": true,
    "has-background-primary-light": incident.closedAt,
    "has-background-light": contextOnly,
  });
  return (
    <div className={cardClass}>
      <div className="card-content">
        <div className="content has-text-small">
          <h4 className={classNames("title", { "is-5": !isChild, "is-6": isChild })}>
            {incident.name}
            {childCount > 0 && <span className="tag is-info is-light ml-2">{childCount}</span>}
          </h4>
          <div className="columns">
            <div className="column is-one-third">
              <strong>{t("location")}: </strong>
              {incident.location.name}
            </div>
            <div className="column is-one-third">
              <strong>{t("createdAt")}: </strong>
              {dayjs(incident.createdAt).format("LLL")}
            </div>
            {incident.closedAt && (
              <div className="column">
                <strong>{t("closedAt")}: </strong>
                {dayjs(incident.closedAt).format("LLL")}
              </div>
            )}
          </div>
        </div>
      </div>
      {!contextOnly && (
        <footer className="card-footer">
          <button
            type="button"
            data-testid="enter-button"
            className="card-footer-item is-ahref is-capitalized"
            onClick={() => {
              navigate(`../${props.incident.id}/journal/edit`);
              dispatch({ type: "SET_INCIDENT", payload: props.incident, forId: props.incident.id });
            }}
          >
            <span className="icon">
              <FontAwesomeIcon icon={faArrowRightFromBracket} />
            </span>
            <span>{t("enter")}</span>
          </button>
          {incident.closedAt === null ? (
            <button
              type="button"
              data-testid="edit-button"
              className="card-footer-item is-ahref is-capitalized"
              onClick={() => navigate(`../${incident.id}/edit`)}
            >
              <span className="icon">
                <FontAwesomeIcon icon={faEdit} />
              </span>
              <span>{t("edit")}</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="delete-button"
              className="card-footer-item is-ahref is-capitalized"
              onClick={() => void deleteIncident(incident.id)}
            >
              <span className="icon">
                <FontAwesomeIcon icon={faTrash} />
              </span>
              <span>{t("delete")}</span>
            </button>
          )}
          {incident.closedAt === null ? (
            <button
              type="button"
              data-testid="close-button"
              className="card-footer-item is-ahref is-capitalized is-danger"
              onClick={() => void closeIncident(incident.id)}
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
              data-testid="open-button"
              onClick={() => void reopenIncident(incident.id)}
            >
              <span className="icon">
                <FontAwesomeIcon icon={faFolderOpen} />
              </span>
              <span>{t("open")}</span>
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

export default List;
