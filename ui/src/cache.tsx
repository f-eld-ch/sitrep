import { InMemoryCache, makeVar } from "@apollo/client";

// active Incident
export const activeIncidentVar = makeVar<string>("");

export const cache: InMemoryCache = new InMemoryCache();
// {
//     typePolicies: {
//         Layers: {
//             fields: {
//                 isActive: {
//                     read(_, { readField }) {
//                         const layerId = readField('id');
//                         return layerId === activeLayerVar()
//                     }
//                 }
//             }
//         }
//     }
// }
