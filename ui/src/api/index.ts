// Public surface of the anti-corruption layer.
// Components and views import ONLY from this module (via the "api" path alias).
// @apollo/client must never be imported outside src/api/.

export type { ApiError, ApiErrorCode } from "./errors";
export { isApiError } from "./errors";
export type { CommandHook, CommandState, QueryResult } from "./result";

// Incident aggregate
export type {
  CreateIncidentArgs,
  IncidentDetailsData,
  IncidentsData,
  UpdateIncidentArgs,
} from "./incident";
export {
  afterIncidentWrite,
  useCloseIncident,
  useCreateIncident,
  useDeleteIncident,
  useIncidentDetails,
  useIncidents,
  useReopenIncident,
  useUpdateIncident,
} from "./incident";

// Journal aggregate
export type { CreateJournalArgs, JournalsData } from "./journal";
export {
  afterJournalWrite,
  useCloseJournal,
  useCreateJournal,
  useJournals,
  useReopenJournal,
} from "./journal";

// Message aggregate
export type {
  CreateMessageArgs,
  JournalMessagesData,
  MessageForTriageData,
  TriageMessageArgs,
  UpdateMessageArgs,
} from "./message";
export {
  useCreateMessage,
  useJournalMessages,
  useMessageForTriage,
  useTriageMessage,
  useUpdateMessage,
} from "./message";

// Layer aggregate
export type {
  AddFeatureArgs,
  AddLayerArgs,
  DeleteFeatureArgs,
  LayersData,
  ModifyFeatureArgs,
} from "./layer";
export {
  afterLayerWrite,
  cleanFeature,
  convertFeatureToGeoJsonFeature,
  layerToFeatureCollection,
  useAddFeature,
  useAddLayer,
  useDeleteFeature,
  useLayersForIncident,
  useModifyFeature,
} from "./layer";
