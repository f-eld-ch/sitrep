import { faClipboard, faLocationDot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React from "react";
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
      <NewForm />
    </>
  );
}

function NewForm() {
  return (
    <>
      <div className="field">
        <p className="control has-icons-left has-icons-right">
          <input className="input" type="text" placeholder="Name" />
          <span className="icon is-small is-left">
            <FontAwesomeIcon icon={faClipboard} />
          </span>
        </p>
      </div>
      <div className="field">
        <p className="control has-icons-left">
          <input className="input" type="text" placeholder="Ort" />
          <span className="icon is-small is-left">
            <FontAwesomeIcon icon={faLocationDot} />
          </span>
        </p>
      </div>
      <div className="field">
        <p className="control">
          <button className="button is-success">Erstellen</button>
        </p>
      </div>
    </>
  );
}
export default New;

export { NewForm, New };
