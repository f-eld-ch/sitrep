
export type ApiErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INCIDENT_NOT_OPEN"
  | "INCIDENT_NOT_CLOSED"
  | "INCIDENT_DELETED"
  | "ALREADY_CLOSED"
  | "ALREADY_OPEN"
  | "INVALID_INPUT"
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
  "CONFLICT",
  "INTERNAL_ERROR",
]);

function isKnownCode(code: unknown): code is ApiErrorCode {
  return typeof code === "string" && knownCodes.has(code as ApiErrorCode);
}

/**
 * Converts an Apollo error into a typed ApiError.
 * Extracts extensions.code from the first GraphQL error when present.
 * Accepts ErrorLike (the type useMutation exposes) but probes for graphQLErrors at runtime.
 */
export function apiErrorFromApolloError(e: { message: string }): ApiError {
  // ApolloError extends ErrorLike and carries graphQLErrors at runtime even
  // though useMutation only types it as ErrorLike.
  const gqlErrors = (e as { graphQLErrors?: Array<{ extensions?: { code?: unknown } }> })
    .graphQLErrors;
  const code = gqlErrors?.[0]?.extensions?.code;
  if (isKnownCode(code)) return new ApiError(code);
  const hasNetworkError = (e as { networkError?: unknown }).networkError;
  if (hasNetworkError) return new ApiError("NETWORK_ERROR");
  return new ApiError("UNKNOWN");
}
