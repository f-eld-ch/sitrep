import { InMemoryCache, makeVar } from "@apollo/client";

// active drawing Layer
export const activeLayerVar = makeVar<string>("");

// active Incident
export const activeIncidentVar = makeVar<string>("");


export const cache: InMemoryCache = new InMemoryCache({
    typePolicies: {
        Layers: {
            fields: {
                isActive: {
                    read(_, { readField }) {
                        const layerId = readField('id');
                        return layerId === activeLayerVar()
                    }
                }
            }
        }
    }
});