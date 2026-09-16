// Public surface of the anti-corruption layer.
// Components and views import ONLY from this module (via the "api" path alias).
// @apollo/client must never be imported outside src/api/.

export type { ApiErrorCode } from "./errors";
export { ApiError, isApiError } from "./errors";
export type { CommandHook, CommandState, QueryResult } from "./result";

// Access control
export type {
  AccessGroupsData,
  GroupMembersData,
  IncidentAccessData,
  IncidentAccessModeData,
  GlobalRolesData,
  UsersData,
} from "./access";
export type {
  ChangeIncidentAccessModeArgs,
  CreateAccessGroupArgs,
  GlobalRoleArgs,
  GroupMemberArgs,
  IncidentRoleArgs,
  RenameAccessGroupArgs,
  UpdateAccessGroupDescriptionArgs,
} from "./access";
export {
  useAccessGroups,
  useAccessUsers,
  useAddGroupMember,
  useArchiveAccessGroup,
  useChangeIncidentAccessMode,
  useCreateAccessGroup,
  useGlobalRoles,
  useMyGlobalRoles,
  useGrantGlobalRole,
  useGrantIncidentRole,
  useGroupMembers,
  useIncidentAccess,
  useIncidentAccessMode,
  useRemoveGroupMember,
  useRenameAccessGroup,
  useUpdateAccessGroupDescription,
  useRevokeGlobalRole,
  useRevokeIncidentRole,
} from "./access";

// Incident aggregate
export type {
  CreateIncidentArgs,
  IncidentDetailsData,
  IncidentsData,
  LinkIncidentParentArgs,
  UnlinkIncidentParentArgs,
  UpdateIncidentArgs,
} from "./incident";
export {
  afterIncidentWrite,
  useCloseIncident,
  useCreateIncident,
  useDeleteIncident,
  useIncidentDetails,
  useIncidents,
  useLinkIncidentParent,
  useReopenIncident,
  useUnlinkIncidentParent,
  useUpdateIncident,
} from "./incident";

// Message aggregate
export type {
  CreateMessageArgs,
  IncidentMessagesData,
  JournalMessagesData,
  MessageForTriageData,
  SchadenplatzCasualtyInput,
  TriageMessageArgs,
  UpdateMessageArgs,
} from "./message";
export {
  useCreateMessage,
  useIncidentMessages,
  useJournalMessages,
  useMessageCasualties,
  useMessageForTriage,
  useRemoveAttachment,
  useTriageMessage,
  useUpdateMessage,
  useUploadAttachment,
} from "./message";

// Resource aggregate
export type {
  AlertResourceArgs,
  ChildIncidentCasualties,
  ContactMedium,
  IncidentResourcesData,
  Resource,
  ResourceContact,
  ResourceDeploymentLocation,
  ResourceFormation,
  ResourceHomeLocation,
  ResourceStatus,
  ResourceUnitSize,
  SchadenplatzWithResources,
} from "./resource";
export {
  useAlertResource,
  useChangeHauptaufgabe,
  useDeployResource,
  useIncidentResources,
  useMarkResourceReady,
  useReassignResource,
  useRelieveResource,
  useStandDownResource,
  useUpdateContact,
  useUpdateDeploymentLocation,
  useUpdatePersonnelCount,
} from "./resource";

// Schadenplatz aggregate
export type { CasualtyDeltas as SchadenplatzCasualtyDeltas } from "./schadenplatz";
export { useCreateSchadenplatz, useRecordCasualties } from "./schadenplatz";

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
