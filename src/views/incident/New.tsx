import React, { useState } from "react";
import { useMutation, gql } from "@apollo/client";

const SAVE_INCIDENT = gql`
  mutation saveIncident($name: string!, $locationName: string!, $coordinates: string) {
    insert_incidents_one(
      object: { location: { data: { name: $locationName, coordinates: $coordinates } }, name: $name }
    ) {
      id
      location {
        coordinates
        name
      }
      createdAt
      name
    }
  }
`;

// interface RocketInventory {
//   id: number;
//   model: string;
//   year: number;
//   stock: number;
// }

// interface NewRocketDetails {
//   model: string;
//   year: number;
//   stock: number;
// }

// export function NewRocketForm() {
//   const [model, setModel] = useState('');
//   const [year, setYear] = useState(0);
//   const [stock, setStock] = useState(0);

//   const [saveRocket, { error, data }] = useMutation<
//     { saveRocket: RocketInventory },
//     { rocket: NewRocketDetails }
//   >(SAVE_ROCKET, {
//     variables: { rocket: { model, year: +year, stock: +stock } }
//   });

//   return (
//     <div>
//       <h3>Add a Rocket</h3>
//       {error ? <p>Oh no! {error.message}</p> : null}
//       {data && data.saveRocket ? <p>Saved!</p> : null}
//       <form>
//         <p>
//           <label>Model</label>
//           <input
//             name="model"
//             onChange={e => setModel(e.target.value)}
//           />
//         </p>
//         <p>
//           <label>Year</label>
//           <input
//             type="number"
//             name="year"
//             onChange={e => setYear(+e.target.value)}
//           />
//         </p>
//         <p>
//           <label>Stock</label>
//           <input
//             type="number"
//             name="stock"
//             onChange={e => setStock(e.target.value)}
//           />
//         </p>
//         <button onClick={() => model && year && stock && saveRocket()}>
//           Add
//         </button>
//       </form>
//     </div>
//   );
// }

function New() {
  return <h3 className="title is-size-3">Ereignis erstellen</h3>;
}

export default New;
