import { faClipboard, faLocationDot, faSitemap } from "@fortawesome/free-solid-svg-icons";
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

function New() {
  const { t } = useTranslation();

  return (
    <>
      <h3 className="title is-size-3 is-capitalized">{t("createIncident")}</h3>
      <div className="box">
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
            candidate.closedAt === null &&
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
        <div className="notification is-danger">{t(`errors.${createState.error.code}`)}</div>
      )}
      {updateState.error && (
        <div className="notification is-danger">{t(`errors.${updateState.error.code}`)}</div>
      )}
      {relationshipError && (
        <div className="notification is-danger">{t(`errors.${relationshipError.code}`)}</div>
      )}
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label htmlFor={nameID} className="label is-capitalized">
            {t("incidentName")}
          </label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-normal">
            <p className="control has-icons-left has-icons-right is-expanded">
              <input
                id={nameID}
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("name") as string}
              />
              <span className="icon is-small is-left">
                <FontAwesomeIcon icon={faClipboard} />
              </span>
            </p>
          </div>
        </div>
      </div>
      {showParentSelector && (
        <div className="field is-horizontal">
          <div className="field-label is-normal">
            <label htmlFor={parentID} className="label is-capitalized">
              {t("parentIncident")}
            </label>
          </div>
          <div className="field-body">
            <div className="field is-normal">
              <div className="control has-icons-left">
                <div className="select is-fullwidth">
                  <select
                    id={parentID}
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
                <span className="icon is-small is-left">
                  <FontAwesomeIcon icon={faSitemap} />
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label htmlFor={locationID} className="label is-capitalized">
            {t("location")}
          </label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-normal">
            <p className="control has-icons-left has-icons-right is-expanded">
              <input
                id={locationID}
                className="input"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("location") as string}
              />
              <span className="icon is-small is-left">
                <FontAwesomeIcon icon={faLocationDot} />
              </span>
            </p>
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label htmlFor={divisionsID} className="label is-capitalized">
            {t("divisions")}
          </label>
        </div>
        <div className="field-body">
          <div className="field is-normal is-flex-grow-1">
            {assignments.map((d, index) => (
              <div key={d.id || `${d.name}-${index}`} className="field is-grouped mb-2">
                <p className="control is-expanded">
                  <input
                    className="input is-small"
                    type="text"
                    value={d.description}
                    onChange={(e) =>
                      setAssignments(
                        updateDivision(assignments, index, { description: e.target.value }),
                      )
                    }
                    placeholder={t("name") as string}
                  />
                </p>
                <p className="control">
                  <input
                    className="input is-small"
                    value={d.name}
                    type="text"
                    onChange={(e) =>
                      setAssignments(updateDivision(assignments, index, { name: e.target.value }))
                    }
                    placeholder={t("short") as string}
                  />
                </p>
                <p className="control">
                  <button
                    type="button"
                    className="button is-small is-danger is-light"
                    onClick={() => setAssignments(assignments.filter((_, i) => i !== index))}
                    aria-label={t("removeDivision") as string}
                  >
                    x
                  </button>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="field is-horizontal">
        <div className="field-label is-small">
          <label htmlFor={divisionsID} className="label">
            {t("devisionAdd")}
          </label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-grouped-multiline">
            <p className="control is-expanded">
              <input
                className="input is-small"
                type="text"
                value={assignmentDescription}
                onChange={(e) => setAssignmentDescription(e.target.value)}
                placeholder={t("name") as string}
              />
            </p>
            <p className="control">
              <input
                id={divisionsID}
                className="input is-small"
                value={assignmentName}
                type="text"
                onChange={(e) => setAssignmentName(e.target.value)}
                placeholder={t("short") as string}
              />
            </p>
            <p className="control">
              <button
                type="submit"
                className="button is-primary is-small is-justified is-rounded is-capitalized"
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
              >
                {t("add")}
              </button>
            </p>
          </div>
        </div>
      </div>
      <div className="field">
        <p className="control">
          <button
            type="submit"
            className="button is-primary is-rounded is-capitalized"
            onClick={() => void handleSave()}
            disabled={name.trim() === ""}
          >
            {t("save")}
          </button>
        </p>
      </div>
    </>
  );
}
export default New;

function initialDivisions(incident: Incident | undefined, t: (key: string) => string): Division[] {
  if (incident?.divisions.length) {
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

export { canEditParentIncident, IncidentForm, initializeDivision, New, updateDivision };
