import { GET_LAYERS } from "./documents";
import { layersVariables } from "./variables";

type AfterLayerWriteEntry = {
  query: typeof GET_LAYERS;
  variables: { incidentId: string; asOf?: string };
};

export function afterLayerWrite(incidentId: string, asOf?: Date): AfterLayerWriteEntry[] {
  return [{ query: GET_LAYERS, variables: layersVariables(incidentId, asOf) }];
}
