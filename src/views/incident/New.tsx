/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/anchor-has-content */
import { useMutation } from "@apollo/client";
import { faClipboard, faLocationDot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { iteratee, reject, unionBy } from "lodash";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Division } from "types";
import {
  Incident,
  InsertIncidentData,
  InsertIncidentVars,
  UpdateIncidentData,
  UpdateIncidentVars
} from "types/incident";
import { GetIncidentDetails, GetIncidents, InsertIncident, UpdateIncident } from "./graphql";

function New() {
  const { t } = useTranslation();

  return (
    <>
      <h3 className="title is-size-3 is-capitalized">{t('createIncident')}</h3>
      <div className="box">
        <IncidentForm incident={undefined} />
      </div>
    </>
  );
}

function IncidentForm(props: { incident: Incident | undefined }) {
  const { incident } = props;
  const { t } = useTranslation();

  const [assignments, setAssignments] = useState<Division[]>(
    incident?.divisions || [
      { id: "", name: "Karte", description: "Nachrichtenkarte" },
      { id: "", name: "Lage", description: "C Lage" },
      { id: "", name: "SC", description: "Stabchef" },
    ]
  );
  const [name, setName] = useState(incident?.name || "");
  const [location, setLocation] = useState(incident?.location.name || "");

  const [assignmentName, setAssignmentName] = useState("");
  const [assignmentDescription, setAssignmentDescription] = useState("");
  const navigate = useNavigate();

  const [insertIncident, { error }] = useMutation<InsertIncidentData, InsertIncidentVars>(InsertIncident, {
    onCompleted(data) {
      navigate(`../${data.insert_incidents_one.id}/journal/view`);
    },
    refetchQueries: [{ query: GetIncidents }, { query: GetIncidentDetails }],
  });

  const [updateIncident, { error: errorUpdate }] = useMutation<UpdateIncidentData, UpdateIncidentVars>(
    UpdateIncident,
    {
      onCompleted(data) {
        navigate(`../journal/view`);
      },
      refetchQueries: [{ query: GetIncidents }, { query: GetIncidentDetails }],
    }
  );

  const handleSave = () => {
    if (incident) {
      updateIncident({
        variables: {
          name: name,
          incidentId: incident.id,
          location: location,
          locationId: incident.location.id,
          divisions: assignments.map((d) => {
            return { name: d.name, description: d.description, incidentId: incident.id };
          }),
        },
      });
      return;
    }
    insertIncident({
      variables: {
        name: name,
        location: location,
        journalName: "Phase 1",
        divisions: assignments.map((d) => {
          return { name: d.name, description: d.description };
        }),
      },
    });
  };

  return (
    <>
      {error ? <div className="notification is-danger">{error?.message}</div> : <></>}
      {errorUpdate ? <div className="notification is-danger">{errorUpdate?.message}</div> : <></>}
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label is-capitalized">{t('name')}</label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-normal">
            <p className="control has-icons-left has-icons-right is-expanded">
              <input
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                placeholder={t('name')}
              />
              <span className="icon is-small is-left">
                <FontAwesomeIcon icon={faClipboard} />
              </span>
            </p>
          </div>
        </div>
      </div>
      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label is-capitalized">{t('location')}</label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-normal">
            <p className="control has-icons-left has-icons-right is-expanded">
              <input
                className="input"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.currentTarget.value)}
                placeholder={t('location')}
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
          <label className="label is-capitalized">{t('divisions')}</label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-grouped-multiline is-normal">
            {assignments.map((d) => {
              let tagsClass = classNames({
                tag: true,
                "is-primary": !d.id,
                "is-info": d.id,
                "is-normal": true,
              });
              return (
                <div key={d.name} className="control">
                  <div className="tags has-addons">
                    <p className={tagsClass}>{`${d.description} (${d.name})`}</p>
                    {d.id ? (
                      <></>
                    ) : (
                      <a
                        className="tag is-delete"
                        onClick={() => setAssignments(reject(assignments, (e) => e.name === d.name))}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="field is-horizontal">
        <div className="field-label is-small">
          <label className="label is-capitalized">{t('add')}</label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-grouped-multiline">
            <p className="control is-expanded">
              <input
                className="input is-small"
                type="text"
                value={assignmentDescription}
                onChange={(e) => setAssignmentDescription(e.currentTarget.value)}
                placeholder={t('name')}
              />
            </p>
            <p className="control">
              <input
                className="input is-small"
                value={assignmentName}
                type="text"
                onChange={(e) => setAssignmentName(e.currentTarget.value)}
                placeholder={t('short')}
              />
            </p>
            <p className="control">
              <button
                className="button is-primary is-small is-justified is-rounded is-capitalized"
                onClick={(e) => {
                  e.preventDefault();

                  setAssignments(
                    unionBy(
                      assignments,
                      [{ id: "", name: assignmentName, description: assignmentDescription }],
                      iteratee("name")
                    )
                  );
                  setAssignmentName("");
                  setAssignmentDescription("");
                }}
              >
                {t('add')}
              </button>
            </p>
          </div>
        </div>
      </div>
      <div className="field">
        <p className="control">
          <button className="button is-primary is-rounded is-capitalized" onClick={handleSave}>
            {t('save')}
          </button>
        </p>
      </div>
    </>
  );
}
export default New;

export { IncidentForm, New };
