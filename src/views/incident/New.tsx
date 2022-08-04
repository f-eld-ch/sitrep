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
  return <h3 className="title is-size-3">Ereignis erstellen</h3>;
}

export default New;
