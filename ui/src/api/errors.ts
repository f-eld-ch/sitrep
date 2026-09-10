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
  | "ATTACHMENT_TOO_LARGE"
  | "ATTACHMENT_DISABLED"
  | "UNKNOWN";

const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  NOT_FOUND: "The requested resource was not found.",
  FORBIDDEN: "You don't have permission to perform this action.",
  INCIDENT_NOT_OPEN: "This action requires the incident to be open.",
  INCIDENT_NOT_CLOSED: "This action requires the incident to be closed.",
  INCIDENT_DELETED: "This incident has been deleted.",
  ALREADY_CLOSED: "The incident is already closed.",
  ALREADY_OPEN: "The incident is already open.",
  INVALID_INPUT: "The request contained invalid data.",
  INVALID_PARENT_INCIDENT: "The specified parent incident is not valid.",
  CONFLICT: "This change conflicts with another operation — please refresh and try again.",
  INTERNAL_ERROR: "An unexpected server error occurred.",
  NETWORK_ERROR: "Network error — please check your connection.",
  ATTACHMENT_TOO_LARGE: "The file exceeds the maximum allowed upload size.",
  ATTACHMENT_DISABLED: "File attachments are not enabled on this server.",
  UNKNOWN: "An unexpected error occurred.",
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
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
// Strip the "source:line:col: fieldName " prefix that gqlgen adds to error messages.
function extractServerMessage(raw: string, code: unknown): string | undefined {
  const stripped = raw.replace(/^\S+:\d+:\d+:\s+\S+\s+/, "").trim();
  // If what remains is just the error code echoed back, it adds no value.
  if (!stripped || stripped === code) return undefined;
  return stripped;
}

export function apiErrorFromApolloError(e: { message: string }): ApiError {
  if (CombinedGraphQLErrors.is(e)) {
    const firstError = e.errors[0];
    const code = firstError?.extensions?.["code"];
    const serverMessage = extractServerMessage(firstError?.message ?? "", code);
    if (isKnownCode(code)) return new ApiError(code, serverMessage);
    return new ApiError("UNKNOWN", serverMessage);
  }
  if (ServerError.is(e)) return new ApiError("NETWORK_ERROR");
  return new ApiError("UNKNOWN");
}

/** Converts any thrown value to an ApiError and rethrows it. */
export function rethrowAsApiError(e: unknown): never {
  if (e instanceof ApiError) throw e;
  if (e != null && typeof e === "object" && "message" in e) {
    throw apiErrorFromApolloError(e as { message: string });
  }
  throw new ApiError("UNKNOWN");
}
