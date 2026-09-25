import { useApolloClient, useMutation } from "@apollo/client/react";
import type { MarkResourceReadyMutation } from "../../gql/next/graphql";
import { apiErrorFromApolloError } from "../errors";
import { recordMutation } from "../mutationActivity";
import type { CommandHook, CommandState } from "../result";
import type { ContactMedium, ResourceFormation, ResourceUnitSize } from "./mapper";
import {
  ALERT_RESOURCE,
  CHANGE_HAUPTAUFGABE,
  DEPLOY_RESOURCE,
  GET_INCIDENT_RESOURCES,
  HAND_OVER,
  MARK_RESOURCE_READY,
  REASSIGN_RESOURCE,
  RELIEVE_RESOURCE,
  RESOURCE_FIELDS,
  STAND_DOWN_RESOURCE,
  UPDATE_CONTACT,
  UPDATE_DEPLOYMENT_LOCATION,
  UPDATE_PERSONNEL_COUNT,
} from "./documents";

// The wire shape of a resource as stored in the Apollo normalized cache.
// All resource mutations return the same ResourceFields fragment, so we derive
// the type from one of them.
type CachedResource = MarkResourceReadyMutation["markResourceReady"];

// Returns a function that reads the current wire state of a resource from the
// Apollo normalized cache. Returns null when the resource is not yet cached.
function useReadResource(): (id: string) => CachedResource | null {
  const client = useApolloClient();
  return (id: string) =>
    client.cache.readFragment<CachedResource>({
      id: client.cache.identify({ __typename: "Resource", id }),
      fragment: RESOURCE_FIELDS,
      fragmentName: "ResourceFields",
    });
}

export interface AlertResourceArgs {
  incidentId: string;
  schadenplatzId?: string | null;
  formation: ResourceFormation;
  name: string;
  size: ResourceUnitSize;
  personnelCount: number;
  hauptaufgabe: string;
  contact?: { medium: ContactMedium; detail: string } | null;
  homeLocation?: { name: string; lat?: number | null; lng?: number | null } | null;
  sourceMessageId?: string | null;
  occurredAt?: Date | null;
  /** Caller-supplied optimistic ID. When provided, the optimistic response uses this id
   *  so the caller can immediately add it to local selection state before awaiting. */
  tempId?: string;
}

export function useAlertResource(): CommandHook<AlertResourceArgs, { resourceId: string }> {
  const [mutate, { loading, error }] = useMutation(ALERT_RESOURCE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const alertResource = async (args: AlertResourceArgs): Promise<{ resourceId: string }> => {
    const tempId = args.tempId ?? `temp-${Date.now()}`;
    // Use occurredAt for the optimistic statusAt so the resource passes the
    // message-time cutoff filter in the picker. Falls back to now when absent.
    const optimisticAt = args.occurredAt?.toISOString() ?? new Date().toISOString();
    const result = await mutate({
      variables: {
        input: {
          incidentId: args.incidentId,
          schadenplatzId: args.schadenplatzId,
          formation: args.formation,
          name: args.name,
          size: args.size,
          personnelCount: args.personnelCount,
          hauptaufgabe: args.hauptaufgabe,
          contact: args.contact,
          homeLocation: args.homeLocation,
          sourceMessageId: args.sourceMessageId,
          occurredAt: args.occurredAt?.toISOString() ?? null,
        },
      },
      optimisticResponse: {
        alertResource: {
          id: tempId,
          incidentId: args.incidentId,
          schadenplatzId: args.schadenplatzId ?? "",
          formation: args.formation,
          name: args.name,
          size: args.size,
          personnelCount: args.personnelCount,
          hauptaufgabe: args.hauptaufgabe,
          contact: args.contact
            ? { medium: args.contact.medium, detail: args.contact.detail }
            : null,
          homeLocation: args.homeLocation
            ? {
                name: args.homeLocation.name,
                lat: args.homeLocation.lat ?? null,
                lng: args.homeLocation.lng ?? null,
              }
            : null,
          deploymentLocation: null,
          status: "AUFGEBOTEN" as const,
          statusAt: optimisticAt,
          alertedAt: optimisticAt,
          readyAt: null,
          deployedAt: null,
          stoodDownAt: null,
          relievedAt: null,
          einsatzBeginn: null,
          einsatzEnde: null,
          predecessorId: null,
          successorId: null,
          sourceMessageId: args.sourceMessageId ?? null,
          deploymentHistory: [],
        },
      },
      update(cache, { data }) {
        const resource = data?.alertResource;
        if (!resource) return;
        const cached = cache.readQuery({
          query: GET_INCIDENT_RESOURCES,
          variables: { incidentId: args.incidentId },
        });
        if (!cached?.incident) return;
        const schadenplatzId = resource.schadenplatzId;
        cache.writeQuery({
          query: GET_INCIDENT_RESOURCES,
          variables: { incidentId: args.incidentId },
          data: {
            ...cached,
            incident: {
              ...cached.incident,
              schadenplaetze: cached.incident.schadenplaetze.map((sp) =>
                sp.id === schadenplatzId ? { ...sp, resources: [...sp.resources, resource] } : sp,
              ),
            },
          },
        });
      },
    });
    const id = result.data?.alertResource?.id;
    if (!id) throw Object.assign(new Error("Alert resource failed"), { code: "UNKNOWN" as const });
    return { resourceId: id };
  };

  return [alertResource, state];
}

export function useMarkResourceReady(): CommandHook<{ id: string; at?: Date }> {
  const readResource = useReadResource();
  const [mutate, { loading, error }] = useMutation(MARK_RESOURCE_READY);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const markReady = async (args: { id: string; at?: Date }): Promise<void> => {
    recordMutation();
    const current = readResource(args.id);
    await mutate({
      variables: { id: args.id, at: args.at?.toISOString() },
      optimisticResponse: current
        ? { markResourceReady: { ...current, status: "EINSATZBEREIT" as const } }
        : undefined,
      update(cache, { data }) {
        const resource = data?.markResourceReady;
        if (!resource) return;
        cache.writeFragment({
          id: cache.identify(resource),
          fragment: RESOURCE_FIELDS,
          data: resource,
        });
      },
    });
  };

  return [markReady, state];
}

export function useDeployResource(): CommandHook<{ id: string; at?: Date }> {
  const readResource = useReadResource();
  const [mutate, { loading, error }] = useMutation(DEPLOY_RESOURCE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const deploy = async (args: { id: string; at?: Date }): Promise<void> => {
    recordMutation();
    const current = readResource(args.id);
    await mutate({
      variables: { id: args.id, at: args.at?.toISOString() },
      optimisticResponse: current
        ? { deployResource: { ...current, status: "EINGESETZT" as const } }
        : undefined,
      update(cache, { data }) {
        const resource = data?.deployResource;
        if (!resource) return;
        cache.writeFragment({
          id: cache.identify(resource),
          fragment: RESOURCE_FIELDS,
          data: resource,
        });
      },
    });
  };

  return [deploy, state];
}

export function useStandDownResource(): CommandHook<{ id: string; at?: Date }> {
  const readResource = useReadResource();
  const [mutate, { loading, error }] = useMutation(STAND_DOWN_RESOURCE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const standDown = async (args: { id: string; at?: Date }): Promise<void> => {
    recordMutation();
    const current = readResource(args.id);
    await mutate({
      variables: { id: args.id, at: args.at?.toISOString() },
      optimisticResponse: current
        ? { standDownResource: { ...current, status: "EINSATZBEREIT" as const } }
        : undefined,
      update(cache, { data }) {
        const resource = data?.standDownResource;
        if (!resource) return;
        cache.writeFragment({
          id: cache.identify(resource),
          fragment: RESOURCE_FIELDS,
          data: resource,
        });
      },
    });
  };

  return [standDown, state];
}

export function useRelieveResource(): CommandHook<{
  id: string;
  successorId?: string | null;
  at?: Date;
}> {
  const readResource = useReadResource();
  const [mutate, { loading, error }] = useMutation(RELIEVE_RESOURCE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const relieve = async (args: {
    id: string;
    successorId?: string | null;
    at?: Date;
  }): Promise<void> => {
    recordMutation();
    const current = readResource(args.id);
    await mutate({
      variables: { id: args.id, successorId: args.successorId, at: args.at?.toISOString() },
      optimisticResponse: current
        ? {
            relieveResource: {
              ...current,
              status: "ABGELOEST" as const,
              successorId: args.successorId ?? null,
            },
          }
        : undefined,
      update(cache, { data }) {
        const resource = data?.relieveResource;
        if (!resource) return;
        cache.writeFragment({
          id: cache.identify(resource),
          fragment: RESOURCE_FIELDS,
          data: resource,
        });
      },
    });
  };

  return [relieve, state];
}

export function useHandOver(): CommandHook<{ id: string; successorId: string; at?: Date }> {
  const readResource = useReadResource();
  const [mutate, { loading, error }] = useMutation(HAND_OVER);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const handOver = async (args: { id: string; successorId: string; at?: Date }): Promise<void> => {
    recordMutation();
    const pred = readResource(args.id);
    const succ = readResource(args.successorId);
    await mutate({
      variables: { id: args.id, successorId: args.successorId, at: args.at?.toISOString() },
      optimisticResponse:
        pred && succ
          ? {
              handOver: {
                relieved: { ...pred, status: "ABGELOEST" as const, successorId: args.successorId },
                successor: { ...succ, status: "EINGESETZT" as const, predecessorId: args.id },
              },
            }
          : undefined,
      update(cache, { data }) {
        const result = data?.handOver;
        if (!result) return;
        cache.writeFragment({
          id: cache.identify(result.relieved),
          fragment: RESOURCE_FIELDS,
          data: result.relieved,
        });
        cache.writeFragment({
          id: cache.identify(result.successor),
          fragment: RESOURCE_FIELDS,
          data: result.successor,
        });
      },
    });
  };

  return [handOver, state];
}

export function useChangeHauptaufgabe(): CommandHook<{
  id: string;
  hauptaufgabe: string;
  at?: Date | null;
}> {
  const readResource = useReadResource();
  const [mutate, { loading, error }] = useMutation(CHANGE_HAUPTAUFGABE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const changeHauptaufgabe = async (args: {
    id: string;
    hauptaufgabe: string;
    at?: Date | null;
  }): Promise<void> => {
    const current = readResource(args.id);
    await mutate({
      variables: {
        id: args.id,
        hauptaufgabe: args.hauptaufgabe,
        at: args.at?.toISOString() ?? null,
      },
      optimisticResponse: current
        ? { changeHauptaufgabe: { ...current, hauptaufgabe: args.hauptaufgabe } }
        : undefined,
      update(cache, { data }) {
        const resource = data?.changeHauptaufgabe;
        if (!resource) return;
        cache.writeFragment({
          id: cache.identify(resource),
          fragment: RESOURCE_FIELDS,
          data: resource,
        });
      },
    });
  };

  return [changeHauptaufgabe, state];
}

export function useUpdatePersonnelCount(): CommandHook<{
  id: string;
  count: number;
  at?: Date | null;
}> {
  const readResource = useReadResource();
  const [mutate, { loading, error }] = useMutation(UPDATE_PERSONNEL_COUNT);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const updateCount = async (args: {
    id: string;
    count: number;
    at?: Date | null;
  }): Promise<void> => {
    const current = readResource(args.id);
    await mutate({
      variables: { id: args.id, count: args.count, at: args.at?.toISOString() ?? null },
      optimisticResponse: current
        ? { updatePersonnelCount: { ...current, personnelCount: args.count } }
        : undefined,
      update(cache, { data }) {
        const resource = data?.updatePersonnelCount;
        if (!resource) return;
        cache.writeFragment({
          id: cache.identify(resource),
          fragment: RESOURCE_FIELDS,
          data: resource,
        });
      },
    });
  };

  return [updateCount, state];
}

export function useReassignResource(): CommandHook<{
  id: string;
  schadenplatzId: string;
  at?: Date | null;
}> {
  const readResource = useReadResource();
  const [mutate, { loading, error }] = useMutation(REASSIGN_RESOURCE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const reassign = async (args: {
    id: string;
    schadenplatzId: string;
    at?: Date | null;
  }): Promise<void> => {
    const current = readResource(args.id);
    await mutate({
      variables: {
        id: args.id,
        schadenplatzId: args.schadenplatzId,
        at: args.at?.toISOString() ?? null,
      },
      optimisticResponse: current
        ? { reassignResource: { ...current, schadenplatzId: args.schadenplatzId } }
        : undefined,
      update(cache, { data }) {
        const resource = data?.reassignResource;
        if (!resource) return;
        cache.writeFragment({
          id: cache.identify(resource),
          fragment: RESOURCE_FIELDS,
          data: resource,
        });
      },
    });
  };

  return [reassign, state];
}

export function useUpdateDeploymentLocation(): CommandHook<{
  id: string;
  label: string;
  at?: Date | null;
}> {
  const readResource = useReadResource();
  const [mutate, { loading, error }] = useMutation(UPDATE_DEPLOYMENT_LOCATION);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const updateLocation = async (args: {
    id: string;
    label: string;
    at?: Date | null;
  }): Promise<void> => {
    const current = readResource(args.id);
    await mutate({
      variables: { id: args.id, label: args.label, at: args.at?.toISOString() ?? null },
      optimisticResponse: current
        ? {
            updateDeploymentLocation: {
              ...current,
              deploymentLocation: { lat: null, lng: null, label: args.label },
            },
          }
        : undefined,
      update(cache, { data }) {
        const resource = data?.updateDeploymentLocation;
        if (!resource) return;
        cache.writeFragment({
          id: cache.identify(resource),
          fragment: RESOURCE_FIELDS,
          data: resource,
        });
      },
    });
  };

  return [updateLocation, state];
}

export function useUpdateContact(): CommandHook<{
  id: string;
  medium: ContactMedium;
  detail: string;
  at?: Date | null;
}> {
  const readResource = useReadResource();
  const [mutate, { loading, error }] = useMutation(UPDATE_CONTACT);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const updateContact = async (args: {
    id: string;
    medium: ContactMedium;
    detail: string;
    at?: Date | null;
  }): Promise<void> => {
    const current = readResource(args.id);
    await mutate({
      variables: {
        id: args.id,
        medium: args.medium,
        detail: args.detail,
        at: args.at?.toISOString() ?? null,
      },
      optimisticResponse: current
        ? { updateContact: { ...current, contact: { medium: args.medium, detail: args.detail } } }
        : undefined,
      update(cache, { data }) {
        const resource = data?.updateContact;
        if (!resource) return;
        cache.writeFragment({
          id: cache.identify(resource),
          fragment: RESOURCE_FIELDS,
          data: resource,
        });
      },
    });
  };

  return [updateContact, state];
}
