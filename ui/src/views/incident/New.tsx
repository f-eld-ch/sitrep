import {
  faClipboard,
  faDeleteLeft,
  faLocationDot,
  faSitemap,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import iteratee from "lodash/iteratee";
import unionBy from "lodash/unionBy";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { Division } from "types";
import type { Incident } from "types/incident";
import {
  useCreateIncident,
  useIncidents,
  useLinkIncidentParent,
  useUnlinkIncidentParent,
  useUpdateIncident,
} from "api";
import { Button, Notification, PageTitle } from "components/ui";

const inputWithIcon =
  "w-full rounded border border-border pl-10 pr-3 py-1.5 text-sm bg-bg text-fg focus:outline-none focus:ring-1 focus:ring-primary";
const inputSmBase =
  "rounded border border-border px-2 py-0.5 text-sm bg-bg text-fg focus:outline-none focus:ring-1 focus:ring-primary";

function New() {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle>{t("createIncident")}</PageTitle>
      <div className="rounded border border-border bg-bg-elevated p-5 shadow-sm">
        <IncidentForm incident={undefined} />
      </div>
    </>
  );
}

function IncidentForm(props: { incident: Incident | undefined }) {
  const { incident } = props;
  const { t } = useTranslation();

  const [assignments, setAssignments] = useState<Division[]>(() => initialDivisions(incident, t));
  const [name, setName] = useState(incident?.name || "");
  const [location, setLocation] = useState(incident?.location.name || "");
  const [parentId, setParentId] = useState(incident?.parentId ?? "");
  const [assignmentName, setAssignmentName] = useState("");
  const [assignmentDescription, setAssignmentDescription] = useState("");
  const navigate = useNavigate();

  const [createIncident, createState] = useCreateIncident();
  const [updateIncident, updateState] = useUpdateIncident();
  const [linkIncidentParent, linkParentState] = useLinkIncidentParent();
  const [unlinkIncidentParent, unlinkParentState] = useUnlinkIncidentParent();
  const incidentsResult = useIncidents();

  const handleSave = async () => {
    if (name.trim() === "") return;

    if (incident) {
      try {
        await updateIncident({
          incidentId: incident.id,
          name,
          location,
          divisions: assignments.map((d) => ({
            id: d.id || undefined,
            name: d.name,
            description: d.description,
          })),
        });

        if (parentId && parentId !== incident.parentId) {
          await linkIncidentParent({ childId: incident.id, parentId });
        } else if (!parentId && incident.parentId) {
          await unlinkIncidentParent({ childId: incident.id, parentId: incident.parentId });
        }

        navigate("../journal/view");
      } catch {
        // updateState.error renders the notification
      }
    } else {
      try {
        const { incidentId } = await createIncident({
          name,
          parentId,
          location,
          layerName: t("divisionsNames.Karte.description"),
          divisions: assignments.map((d) => ({ name: d.name, description: d.description })),
        });

        navigate(`../${incidentId}/journal/view`);
      } catch {
        // createState.error renders the notification
      }
    }
  };

  const nameID = useId();
  const locationID = useId();
  const parentID = useId();
  const divisionsID = useId();
  const parentCandidates =
    incidentsResult.status === "ready"
      ? incidentsResult.data.incidents.filter(
          (candidate) =>
            candidate.id !== incident?.id &&
            candidate.deletedAt === null &&
            (candidate.closedAt === null || candidate.id === incident?.parentId) &&
            candidate.parentId === null,
        )
      : [];
  const relationshipError = linkParentState.error ?? unlinkParentState.error;
  const showParentSelector = canEditParentIncident(
    incident,
    incidentsResult.status === "ready" ? incidentsResult.data.incidents : [],
  );

  return (
    <>
      {createState.error && (
        <Notification variant="danger" className="mb-3">
          {t(`errors.${createState.error.code}`)}
        </Notification>
      )}
      {updateState.error && (
        <Notification variant="danger" className="mb-3">
          {t(`errors.${updateState.error.code}`)}
        </Notification>
      )}
      {relationshipError && (
        <Notification variant="danger" className="mb-3">
          {t(`errors.${relationshipError.code}`)}
        </Notification>
      )}

      {/* Incident name */}
      <div className="mb-4 flex flex-col items-start xl:flex-row xl:gap-4">
        <label
          htmlFor={nameID}
          className="mb-1 w-full text-sm font-bold capitalize xl:mb-0 xl:w-64 xl:shrink-0 xl:pt-1.5 xl:text-right"
        >
          {t("incidentName")}
        </label>
        <div className="relative w-full flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-sm text-fg-muted/50">
            <FontAwesomeIcon icon={faClipboard} />
          </span>
          <input
            id={nameID}
            className={inputWithIcon}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("name") as string}
          />
        </div>
      </div>

      {/* Parent incident */}
      {showParentSelector && (
        <div className="mb-4 flex flex-col items-start xl:flex-row xl:gap-4">
          <label
            htmlFor={parentID}
            className="mb-1 w-full text-sm font-bold capitalize xl:mb-0 xl:w-64 xl:shrink-0 xl:pt-1.5 xl:text-right"
          >
            {t("parentIncident")}
          </label>
          <div className="relative w-full flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-sm text-fg-muted/50">
              <FontAwesomeIcon icon={faSitemap} />
            </span>
            <select
              id={parentID}
              className={inputWithIcon}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">{t("noParentIncident")}</option>
              {parentCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Location */}
      <div className="mb-4 flex flex-col items-start xl:flex-row xl:gap-4">
        <label
          htmlFor={locationID}
          className="mb-1 w-full text-sm font-bold capitalize xl:mb-0 xl:w-64 xl:shrink-0 xl:pt-1.5 xl:text-right"
        >
          {t("location")}
        </label>
        <div className="relative w-full flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-sm text-fg-muted/50">
            <FontAwesomeIcon icon={faLocationDot} />
          </span>
          <input
            id={locationID}
            className={inputWithIcon}
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("location") as string}
          />
        </div>
      </div>

      <hr className="my-5 border-border" />

      {/* Existing divisions */}
      <div className="mb-2 flex flex-col items-start xl:flex-row xl:gap-4">
        <label className="mb-1 w-full text-sm font-bold capitalize xl:mb-0 xl:w-64 xl:shrink-0 xl:pt-1.5 xl:text-right">
          {t("divisions")}
        </label>
        <div className="w-full flex-1 space-y-2">
          {assignments.map((d, index) => (
            <div key={d.id || `new-${index}`} className="flex gap-2">
              <input
                className={inputSmBase + " flex-1 min-w-0"}
                type="text"
                value={d.description}
                onChange={(e) =>
                  setAssignments(
                    updateDivision(assignments, index, { description: e.target.value }),
                  )
                }
                placeholder={t("name") as string}
              />
              <input
                className={inputSmBase + " w-20"}
                value={d.name}
                type="text"
                onChange={(e) =>
                  setAssignments(updateDivision(assignments, index, { name: e.target.value }))
                }
                placeholder={t("short") as string}
              />
              {canRemoveDivision(d) ? (
                <Button
                  type="button"
                  variant="danger"
                  light
                  size="xs"
                  onClick={() => setAssignments(assignments.filter((_, i) => i !== index))}
                  aria-label={t("removeDivision") as string}
                >
                  <FontAwesomeIcon icon={faDeleteLeft} />
                </Button>
              ) : (
                <Button type="button" variant="danger" light size="xs" invisible>
                  <FontAwesomeIcon icon={faDeleteLeft} />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add division */}
      <div className="mb-5 flex flex-col items-start xl:flex-row xl:gap-4">
        <label
          htmlFor={divisionsID}
          className="mb-1 w-full text-sm font-bold capitalize xl:mb-0 xl:w-64 xl:shrink-0 xl:pt-1.5 xl:text-right"
        >
          {t("devisionAdd")}
        </label>
        <div className="flex w-full flex-1 gap-2">
          <input
            className={inputSmBase + " flex-1 min-w-0"}
            type="text"
            value={assignmentDescription}
            onChange={(e) => setAssignmentDescription(e.target.value)}
            placeholder={t("name") as string}
          />
          <input
            id={divisionsID}
            className={inputSmBase + " w-20"}
            value={assignmentName}
            type="text"
            onChange={(e) => setAssignmentName(e.target.value)}
            placeholder={t("short") as string}
          />
          <Button
            type="submit"
            variant="success"
            size="xs"
            onClick={(e) => {
              e.preventDefault();
              if (assignmentName.trim() === "" || assignmentDescription.trim() === "") return;
              setAssignments(
                unionBy(
                  assignments,
                  [{ id: "", name: assignmentName, description: assignmentDescription }],
                  iteratee("name"),
                ),
              );
              setAssignmentName("");
              setAssignmentDescription("");
            }}
            disabled={assignmentName.trim() === "" || assignmentDescription.trim() === ""}
            aria-label={t("add") as string}
          >
            <FontAwesomeIcon icon={faPlus} />
          </Button>
        </div>
      </div>

      <Button
        className="xl:ml-[272px]"
        type="submit"
        variant="primary"
        capitalized
        onClick={() => void handleSave()}
        disabled={name.trim() === ""}
      >
        {t("save")}
      </Button>
    </>
  );
}
export default New;

function initialDivisions(incident: Incident | undefined, t: (key: string) => string): Division[] {
  if (incident !== undefined) {
    return incident.divisions.map((division, index) => initializeDivision(division, index));
  }

  return [
    {
      id: "",
      name: t("divisionsNames.Karte.name"),
      description: t("divisionsNames.Karte.description"),
    },
    {
      id: "",
      name: t("divisionsNames.CLage.name"),
      description: t("divisionsNames.CLage.description"),
    },
    {
      id: "",
      name: t("divisionsNames.SC.name"),
      description: t("divisionsNames.SC.description"),
    },
  ];
}

function initializeDivision(division: Division, index: number): Division {
  const fallback = `Division ${index + 1}`;

  return {
    ...division,
    name: division.name.trim() || fallback,
    description: division.description.trim() || fallback,
  };
}

function updateDivision(
  divisions: Division[],
  index: number,
  patch: Partial<Division>,
): Division[] {
  return divisions.map((division, i) => (i === index ? { ...division, ...patch } : division));
}

function canRemoveDivision(division: Division): boolean {
  return division.id === "";
}

function canEditParentIncident(
  incident: Incident | undefined,
  incidents: Incident[] = [],
): boolean {
  if (incident === undefined) return true;

  return (
    incident.childIncidents.length === 0 &&
    !incidents.some(
      (candidate) => candidate.deletedAt === null && candidate.parentId === incident.id,
    )
  );
}

export {
  canEditParentIncident,
  IncidentForm,
  canRemoveDivision,
  initialDivisions,
  initializeDivision,
  New,
  updateDivision,
};
