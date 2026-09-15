import { useMutation } from "@apollo/client/react";
import type {
  ResourceFormation,
  ResourceUnitSize,
  ContactMedium,
} from "../../gql/next/graphql";
import { apiErrorFromApolloError } from "../errors";
import type { CommandHook, CommandState } from "../result";
import {
  ALERT_RESOURCE,
  CHANGE_HAUPTAUFGABE,
  DEPLOY_RESOURCE,
  MARK_RESOURCE_READY,
  RELIEVE_RESOURCE,
  STAND_DOWN_RESOURCE,
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
    });
    const id = result.data?.alertResource?.id;
    if (!id) throw Object.assign(new Error("Alert resource failed"), { code: "UNKNOWN" as const });
    return { resourceId: id };
  };

  return [alertResource, state];
}

export function useMarkResourceReady(): CommandHook<{ id: string }> {
  const [mutate, { loading, error }] = useMutation(MARK_RESOURCE_READY);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const markReady = async ({ id }: { id: string }): Promise<void> => {
    await mutate({ variables: { id } });
  };

  return [markReady, state];
}

export function useDeployResource(): CommandHook<{ id: string }> {
  const [mutate, { loading, error }] = useMutation(DEPLOY_RESOURCE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const deploy = async ({ id }: { id: string }): Promise<void> => {
    await mutate({ variables: { id } });
  };

  return [deploy, state];
}

export function useStandDownResource(): CommandHook<{ id: string }> {
  const [mutate, { loading, error }] = useMutation(STAND_DOWN_RESOURCE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const standDown = async ({ id }: { id: string }): Promise<void> => {
    await mutate({ variables: { id } });
  };

  return [standDown, state];
}

export function useRelieveResource(): CommandHook<{ id: string; successorId?: string | null }> {
  const [mutate, { loading, error }] = useMutation(RELIEVE_RESOURCE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const relieve = async (args: { id: string; successorId?: string | null }): Promise<void> => {
    await mutate({ variables: { id: args.id, successorId: args.successorId } });
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
