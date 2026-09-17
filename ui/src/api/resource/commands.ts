import { useMutation } from "@apollo/client/react";
import type { ResourceFormation, ResourceUnitSize, ContactMedium } from "./mapper";
import { apiErrorFromApolloError } from "../errors";
import { recordMutation } from "../mutationActivity";
import type { CommandHook, CommandState } from "../result";
import {
  ALERT_RESOURCE,
  CHANGE_HAUPTAUFGABE,
  DEPLOY_RESOURCE,
  GET_INCIDENT_RESOURCES,
  MARK_RESOURCE_READY,
  REASSIGN_RESOURCE,
  RELIEVE_RESOURCE,
  RESOURCE_FIELDS,
  STAND_DOWN_RESOURCE,
  UPDATE_CONTACT,
  UPDATE_DEPLOYMENT_LOCATION,
  UPDATE_PERSONNEL_COUNT,
} from "./documents";

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
}

export function useAlertResource(): CommandHook<AlertResourceArgs, { resourceId: string }> {
  const [mutate, { loading, error }] = useMutation(ALERT_RESOURCE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const alertResource = async (args: AlertResourceArgs): Promise<{ resourceId: string }> => {
    const tempId = `temp-${Date.now()}`;
    const now = new Date().toISOString();
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
          statusAt: now,
          alertedAt: now,
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
  const [mutate, { loading, error }] = useMutation(MARK_RESOURCE_READY);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const markReady = async (args: { id: string; at?: Date }): Promise<void> => {
    recordMutation();
    await mutate({ variables: { id: args.id, at: args.at?.toISOString() } });
  };

  return [markReady, state];
}

export function useDeployResource(): CommandHook<{ id: string; at?: Date }> {
  const [mutate, { loading, error }] = useMutation(DEPLOY_RESOURCE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const deploy = async (args: { id: string; at?: Date }): Promise<void> => {
    recordMutation();
    await mutate({ variables: { id: args.id, at: args.at?.toISOString() } });
  };

  return [deploy, state];
}

export function useStandDownResource(): CommandHook<{ id: string; at?: Date }> {
  const [mutate, { loading, error }] = useMutation(STAND_DOWN_RESOURCE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const standDown = async (args: { id: string; at?: Date }): Promise<void> => {
    recordMutation();
    await mutate({
      variables: { id: args.id, at: args.at?.toISOString() },
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
    await mutate({
      variables: { id: args.id, successorId: args.successorId, at: args.at?.toISOString() },
    });
  };

  return [relieve, state];
}

export function useChangeHauptaufgabe(): CommandHook<{ id: string; hauptaufgabe: string }> {
  const [mutate, { loading, error }] = useMutation(CHANGE_HAUPTAUFGABE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const changeHauptaufgabe = async (args: { id: string; hauptaufgabe: string }): Promise<void> => {
    await mutate({ variables: { id: args.id, hauptaufgabe: args.hauptaufgabe } });
  };

  return [changeHauptaufgabe, state];
}

export function useUpdatePersonnelCount(): CommandHook<{ id: string; count: number }> {
  const [mutate, { loading, error }] = useMutation(UPDATE_PERSONNEL_COUNT);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const updateCount = async (args: { id: string; count: number }): Promise<void> => {
    await mutate({ variables: { id: args.id, count: args.count } });
  };

  return [updateCount, state];
}

export function useReassignResource(): CommandHook<{ id: string; schadenplatzId: string }> {
  const [mutate, { loading, error }] = useMutation(REASSIGN_RESOURCE);
  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };
  const reassign = async (args: { id: string; schadenplatzId: string }): Promise<void> => {
    await mutate({ variables: { id: args.id, schadenplatzId: args.schadenplatzId } });
  };
  return [reassign, state];
}

export function useUpdateDeploymentLocation(): CommandHook<{ id: string; label: string }> {
  const [mutate, { loading, error }] = useMutation(UPDATE_DEPLOYMENT_LOCATION);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const update = async (args: { id: string; label: string }): Promise<void> => {
    await mutate({ variables: { id: args.id, label: args.label } });
  };

  return [update, state];
}

export function useUpdateContact(): CommandHook<{
  id: string;
  medium: ContactMedium;
  detail: string;
}> {
  const [mutate, { loading, error }] = useMutation(UPDATE_CONTACT);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const update = async (args: {
    id: string;
    medium: ContactMedium;
    detail: string;
  }): Promise<void> => {
    await mutate({ variables: { id: args.id, medium: args.medium, detail: args.detail } });
  };

  return [update, state];
}
