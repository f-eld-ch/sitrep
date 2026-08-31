import { GET_LAYERS } from "./documents.next";

type AfterLayerWriteEntry = { query: typeof GET_LAYERS; variables: { incidentId: string } };

export function afterLayerWrite(incidentId: string): AfterLayerWriteEntry[] {
  return [{ query: GET_LAYERS, variables: { incidentId } }];
}
