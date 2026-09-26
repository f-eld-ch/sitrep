export type { AlertResourceArgs } from "./commands";
export {
  useAlertResource,
  useChangeHauptaufgabe,
  useDeployResource,
  useHandOver,
  useMarkResourceReady,
  useReassignResource,
  useRelieveResource,
  useStandDownResource,
  useUpdateContact,
  useUpdateDeploymentLocation,
  useUpdatePersonnelCount,
} from "./commands";
export type {
  ContactMedium,
  ChildIncidentCasualties,
  IncidentResourcesData,
  Resource,
  ResourceContact,
  ResourceDeploymentLocation,
  ResourceDeploymentPeriod,
  ResourceFormation,
  ResourceHomeLocation,
  ResourceStatus,
  ResourceUnitSize,
  SchadenplatzWithResources,
} from "./queries";
export { useIncidentResources } from "./queries";
