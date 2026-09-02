export type ApiErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INCIDENT_NOT_OPEN"
  | "INCIDENT_NOT_CLOSED"
  | "INCIDENT_DELETED"
  | "ALREADY_CLOSED"
  | "ALREADY_OPEN"
  | "INVALID_INPUT"
  | "INVALID_PARENT_INCIDENT"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "ApiError";
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

const knownCodes = new Set<ApiErrorCode>([
  "NOT_FOUND",
  "FORBIDDEN",
  "INCIDENT_NOT_OPEN",
  "INCIDENT_NOT_CLOSED",
  "INCIDENT_DELETED",
  "ALREADY_CLOSED",
  "ALREADY_OPEN",
  "INVALID_INPUT",
  "INVALID_PARENT_INCIDENT",
  "CONFLICT",
  "INTERNAL_ERROR",
]);

function isKnownCode(code: unknown): code is ApiErrorCode {
  return typeof code === "string" && knownCodes.has(code as ApiErrorCode);
}

import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { ServerError } from "@apollo/client/errors";

/**
 * Converts an Apollo 4 error into a typed ApiError.
 * GraphQL errors arrive as CombinedGraphQLErrors; transport errors as ServerError.
 */
export function apiErrorFromApolloError(e: { message: string }): ApiError {
  if (CombinedGraphQLErrors.is(e)) {
    const code = e.errors[0]?.extensions?.["code"];
    if (isKnownCode(code)) return new ApiError(code);
    return new ApiError("UNKNOWN");
  }
  if (ServerError.is(e)) return new ApiError("NETWORK_ERROR");
  return new ApiError("UNKNOWN");
}
