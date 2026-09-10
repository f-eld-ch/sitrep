import {
  faArrowRightFromBracket,
  faEdit,
  faEye,
  faEyeLowVision,
  faFolderClosed,
  faFolderOpen,
  faLock,
  faLockOpen,
  faPlusCircle,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { Spinner } from "components";
import { Button, Notification, Tag } from "components/ui";
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
    return <Notification variant="danger">{t(`errors.${result.error.code}`)}</Notification>;
  }
  if (result.status === "loading") return <Spinner />;

  return (
    <div>
      <h3 className="text-3xl font-bold capitalize mb-4">{t("incidents")}</h3>
      {mutationError && (
        <Notification variant="danger" className="mb-4">
          {t(`errors.${mutationError.code}`)}
        </Notification>
      )}
      <div className="flex gap-2 mb-4">
        <Button
          type="button"
          variant="success"
          size="sm"
          rounded
          light
          capitalized
          onClick={() => navigate("../new")}
        >
          <FontAwesomeIcon icon={faPlusCircle} />
          <span>{t("create")}</span>
        </Button>
        <Button
          type="button"
          variant="warning"
          size="sm"
          rounded
          light
          onClick={() => setFilterClosed(!filterClosed)}
        >
          <FontAwesomeIcon icon={filterClosed ? faEye : faEyeLowVision} />
          <span>{filterClosed ? t("showClosed") : t("hideClosed")}</span>
        </Button>
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
  const topLevelIncidents = activeIncidents.filter((incident) => !incident.parentId);

  return (
    <div>
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
              <div className="ml-5 pl-4 border-l-[3px] border-info">
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

const footerItem =
  "flex flex-1 items-center justify-center gap-1.5 py-2 text-sm capitalize cursor-pointer hover:bg-bg-subtle border-r border-border last:border-r-0 transition-colors";

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
    contextOnly = false,
  } = props;
  const navigate = useNavigate();
  const { dispatch } = useContext(IncidentContext);
  const { t } = useTranslation();

  const cardClass = classNames(
    "border border-border rounded shadow-md dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)] dark:border-white/10 mb-3",
    incident.closedAt
      ? "bg-warning/10 dark:bg-warning/5"
      : contextOnly
        ? "bg-bg-subtle"
        : "bg-bg-elevated",
  );

  return (
    <div className={cardClass}>
      <div className="p-4">
        <div className="text-sm">
          <h4
            className={classNames("font-bold mb-2", isChild ? "text-lg" : "text-xl")}
          >
            {incident.name}
            <Tag
              light={true}
              size="sm"
              variant="gray"
              className="ml-2 p-1 align-middle"
              title={
                incident.accessMode === "RESTRICTED"
                  ? t("incidentAccess.restricted")
                  : t("incidentAccess.openAccess")
              }
            >
              <FontAwesomeIcon icon={incident.accessMode === "RESTRICTED" ? faLock : faLockOpen} />
            </Tag>
          </h4>
          <div className="flex gap-4">
            <div className="flex-1">
              <strong>{t("location")}: </strong>
              {incident.location.name}
            </div>
            <div className="flex-1">
              <strong>{t("createdAt")}: </strong>
              {dayjs(incident.createdAt).format("LLL")}
            </div>
            {incident.closedAt && (
              <div className="flex-1">
                <strong>{t("closedAt")}: </strong>
                {dayjs(incident.closedAt).format("LLL")}
              </div>
            )}
          </div>
        </div>
      </div>
      {!contextOnly && (
        <footer className="flex border-t border-border">
          <button
            type="button"
            data-testid="enter-button"
            className={footerItem}
            onClick={() => {
              navigate(`../${props.incident.id}/journal/edit`);
              dispatch({ type: "SET_INCIDENT", payload: props.incident, forId: props.incident.id });
            }}
          >
            <FontAwesomeIcon icon={faArrowRightFromBracket} />
            <span>{t("enter")}</span>
          </button>
          {incident.canWrite && incident.closedAt === null && (
            <button
              type="button"
              data-testid="edit-button"
              className={footerItem}
              onClick={() => navigate(`../${incident.id}/edit`)}
            >
              <FontAwesomeIcon icon={faEdit} />
              <span>{t("edit")}</span>
            </button>
          )}
          {incident.canDelete && incident.closedAt !== null && (
            <button
              type="button"
              data-testid="delete-button"
              className={classNames(footerItem, "text-danger")}
              onClick={() => void deleteIncident(incident.id)}
            >
              <FontAwesomeIcon icon={faTrash} />
              <span>{t("delete")}</span>
            </button>
          )}
          {incident.canManage && incident.closedAt === null && (
            <button
              type="button"
              data-testid="close-button"
              className={classNames(footerItem, "text-danger")}
              onClick={() => void closeIncident(incident.id)}
            >
              <FontAwesomeIcon icon={faFolderClosed} />
              <span>{t("close")}</span>
            </button>
          )}
          {incident.canManage && incident.closedAt !== null && (
            <button
              type="button"
              data-testid="open-button"
              className={classNames(footerItem, "text-success")}
              onClick={() => void reopenIncident(incident.id)}
            >
              <FontAwesomeIcon icon={faFolderOpen} />
              <span>{t("open")}</span>
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

export default List;
