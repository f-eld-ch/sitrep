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
import { clsx } from "clsx";
import { Spinner } from "components";
import { Button, Notification, PageTitle, Tag } from "components/ui";
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
      <PageTitle>{t("incidents")}</PageTitle>
      {mutationError && (
        <Notification variant="danger" className="mb-4">
          {t(`errors.${mutationError.code}`)}
        </Notification>
      )}
      <div className="mb-4 flex gap-2">
        <Button
          type="button"
          variant="success"
          size="xs"
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
          size="xs"
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
              <div className="ml-5 border-l-[3px] border-info pl-4">
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
  "flex flex-1 basis-1/2 sm:basis-0 items-center justify-center gap-1.5 py-2 text-sm capitalize cursor-pointer hover:bg-bg-subtle transition-colors";

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

  const cardClass = clsx(
    "mb-3 rounded border border-border shadow-md dark:border-white/10 dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)]",
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
          <h4 className={clsx("mb-2 font-bold", isChild ? "text-lg" : "text-xl")}>
            {incident.name}
            <Tag
              light={true}
              size="sm"
              variant="gray"
              className="ml-2 px-1 py-1 align-middle"
              title={
                incident.accessMode === "RESTRICTED"
                  ? t("incidentAccess.restricted")
                  : t("incidentAccess.openAccess")
              }
            >
              <FontAwesomeIcon icon={incident.accessMode === "RESTRICTED" ? faLock : faLockOpen} />
            </Tag>
          </h4>
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            <div className="sm:flex-1">
              <strong>{t("location")}: </strong>
              {incident.location.name}
            </div>
            <div className="sm:flex-1">
              <strong>{t("createdAt")}: </strong>
              {dayjs(incident.createdAt).format("LLL")}
            </div>
            {incident.closedAt && (
              <div className="sm:flex-1">
                <strong>{t("closedAt")}: </strong>
                {dayjs(incident.closedAt).format("LLL")}
              </div>
            )}
          </div>
        </div>
      </div>
      {!contextOnly && (
        <footer className="flex flex-wrap divide-x divide-border border-t border-border">
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
              className={clsx(footerItem, "text-danger")}
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
              className={clsx(footerItem, "text-danger")}
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
              className={clsx(footerItem, "text-success")}
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
