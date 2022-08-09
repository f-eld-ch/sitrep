/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/anchor-has-content */
import { gql, useMutation } from "@apollo/client";
import { faClipboard, faLocationDot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { reject, iteratee, unionBy } from "lodash";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Division } from "types";
import {
  Incident,
  InsertIncidentData,
  InsertIncidentVars,
  UpdateIncidentData,
  UpdateIncidentVars,
} from "types/incident";

function New() {
  return (
    <>
      <h3 className="title is-size-3">Ereignis erstellen</h3>
      <div className="box">
        <IncidentForm incident={undefined} />
      </div>
    </>
  );
}

export const INSERT_INCIDENT = gql`
  mutation InsertIncident(
    $name: String!
    $location: String
    $divisions: [divisions_insert_input!]!
    $journalName: String
  ) {
    insert_incidents_one(
      object: {
        name: $name
        location: { data: { name: $location } }
        journals: { data: { name: $journalName } }
        divisions: { data: $divisions }
      }
    ) {
      id
      name
      journals {
        id
        name
      }
      divisions {
        name
        id
        description
      }
    }
  }
`;

const UPDATE_INCIDENT = gql`
  mutation UpdateIncident(
    $incidentId: uuid!
    $name: String!
    $location: String!
    $locationId: uuid!
    $divisions: [divisions_insert_input!]!
  ) {
    update_locations_by_pk(pk_columns: { id: $locationId }, _set: { name: $location }) {
      id
      name
    }
    insert_divisions(
      objects: $divisions
      on_conflict: { constraint: divisions_name_incident_id_key, update_columns: [description, name] }
    ) {
      affected_rows
    }
    update_incidents_by_pk(pk_columns: { id: $incidentId }, _set: { name: $name }) {
      id
      name
      journals {
        id
        name
      }
      divisions {
        name
        id
        description
      }
    }
  }
`;

function IncidentForm(props: { incident: Incident | undefined }) {
  const { incident } = props;
  const [assignments, setAssignments] = useState<Division[]>(
    incident?.divisions || [
      { id: "", name: "Lage", description: "Lagekarte" },
      { id: "", name: "SC", description: "Stabchef" },
    ]
  );
  const [name, setName] = useState(incident?.name || "");
  const [location, setLocation] = useState(incident?.location.name || "");

  const [assignmentName, setAssignmentName] = useState("");
  const [assignmentDescription, setAssignmentDescription] = useState("");
  const navigate = useNavigate();

  const [insertIncident, { error }] = useMutation<InsertIncidentData, InsertIncidentVars>(INSERT_INCIDENT, {
    onCompleted(data) {
      navigate(`../${data.insert_incidents_one.id}/journal/view`);
    },
  });

  const [updateIncident, { error: errorUpdate }] = useMutation<UpdateIncidentData, UpdateIncidentVars>(
    UPDATE_INCIDENT,
    {
      onCompleted(data) {
        navigate(`../journal/view`);
      },
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
          <label className="label">Name</label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-normal">
            <p className="control has-icons-left has-icons-right is-expanded">
              <input
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                placeholder="Name"
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
          <label className="label">Ort</label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-normal">
            <p className="control has-icons-left has-icons-right is-expanded">
              <input
                className="input"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.currentTarget.value)}
                placeholder="Ort"
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
          <label className="label">Fachbereiche</label>
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
          <label className="label">Fachbereiche hinzufügen</label>
        </div>
        <div className="field-body">
          <div className="field is-grouped is-grouped-multiline">
            <p className="control is-expanded">
              <input
                className="input is-small"
                type="text"
                value={assignmentDescription}
                onChange={(e) => setAssignmentDescription(e.currentTarget.value)}
                placeholder="Name"
              />
            </p>
            <p className="control">
              <input
                className="input is-small"
                value={assignmentName}
                type="text"
                onChange={(e) => setAssignmentName(e.currentTarget.value)}
                placeholder="Kürzel"
              />
            </p>
            <p className="control">
              <button
                className="button is-primary is-small is-justified is-rounded"
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
                Hinzufügen
              </button>
            </p>
          </div>
        </div>
      </div>
      <div className="field">
        <p className="control">
          <button className="button is-primary is-rounded" onClick={handleSave}>
            Speichern
          </button>
        </p>
      </div>
    </>
  );
}
export default New;

export { IncidentForm, New };
