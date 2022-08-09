/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/anchor-has-content */
import { gql, useMutation } from "@apollo/client";
import { faClipboard, faLocationDot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { reject, iteratee, unionBy } from "lodash";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DivisionInput, Incident, InsertIncidentData, InsertIncidentVars } from "types/incident";
// import { useMutation, gql } from "@apollo/client";

// const SAVE_INCIDENT = gql`
//   mutation saveIncident($name: string!, $locationName: string!, $coordinates: string) {
//     insert_incidents_one(
//       object: { location: { data: { name: $locationName, coordinates: $coordinates } }, name: $name }
//     ) {
//       id
//       location {
//         coordinates
//         name
//       }
//       createdAt
//       name
//     }
//   }
// `;

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
    $incidentId: uuid
    $name: String!
    $location: String
    $divisions: [divisions_insert_input!]!
    $journalName: String
  ) {
    update_incident_by_pk(
      pk_columns: { id: $incidentID }
      _set: { content: $content, sender: $sender, receiver: $receiver, time: $time }
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

function IncidentForm(props: { incident: Incident | undefined }) {
  const { incident } = props;
  const [assignments, setAssignments] = useState<DivisionInput[]>(
    incident?.divisions || [
      { name: "Lage", description: "Lagekarte" },
      { name: "SC", description: "Stabchef" },
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

  const handleSave = () => {
    insertIncident({
      variables: {
        name: name,
        location: location,
        journalName: "Phase 1",
        divisions: assignments,
      },
    });
  };

  return (
    <>
      {error ? <div className="notification is-danger">{error?.message}</div> : <></>}

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
                "is-primary": true,
                "is-normal": true,
              });
              return (
                <div key={d.name} className="control">
                  <div className="tags has-addons">
                    <p className={tagsClass}>{`${d.description} (${d.name})`}</p>
                    <a
                      className="tag is-delete"
                      onClick={() => setAssignments(reject(assignments, (e) => e.name === d.name))}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="field is-horizontal">
        <div className="field-label is-normal">
          <label className="label">Fachbereiche Hinzufügen</label>
        </div>
        <div className="field-body">
          <div className="field is-grouped has-addons">
            <p className="control is-expanded">
              <input
                className="input"
                type="text"
                value={assignmentDescription}
                onChange={(e) => setAssignmentDescription(e.currentTarget.value)}
                placeholder="Name"
              />
            </p>
            <div className="field has-addons">
              <p className="control">
                <input
                  className="input"
                  value={assignmentName}
                  type="text"
                  onChange={(e) => setAssignmentName(e.currentTarget.value)}
                  placeholder="Kürzel"
                />
              </p>
              <p className="control">
                <button
                  className="button is-primary"
                  onClick={(e) => {
                    e.preventDefault();

                    setAssignments(
                      unionBy(
                        assignments,
                        [{ name: assignmentName, description: assignmentDescription }],
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
      </div>
      <div className="field is-horizontal">
        <p className="control">
          <button className="button is-primary" onClick={handleSave}>
            Erstellen
          </button>
        </p>
      </div>
    </>
  );
}
export default New;

export { IncidentForm, New };
